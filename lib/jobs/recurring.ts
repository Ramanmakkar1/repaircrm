import { db } from "@/lib/db";
import { withNextNumber } from "@/lib/sequence";
import {
  addUtcDays,
  advanceRunDate,
  asFrequency,
  startOfUtcDay,
} from "@/components/recurring/meta";

/**
 * Unattended recurring-invoice generation.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CODE EXISTS TWICE — READ BEFORE EDITING EITHER COPY
 * ---------------------------------------------------------------------------
 * app/(app)/invoices/recurring/actions.ts already contains this logic, but it
 * is unreachable from a background job:
 *
 *   - the file is "use server", so every export is a Server Action;
 *   - `runDueRecurringInvoices()` takes NO shopId — it derives one from
 *     `requireUser()`, and there is no session on a timer tick;
 *   - the `generate()` helper that does the real work is not exported, and
 *     exporting it would be actively unsafe: in a "use server" file it would
 *     become a browser-callable endpoint taking `shopId` as its first
 *     argument, i.e. a tenant-crossing hole in the exact rule lib/db.ts sets
 *     out ("never trust a shopId that arrived over the wire").
 *
 * So the loop is reimplemented here against the SAME primitives the action
 * uses — `db`, `withNextNumber`, and the cadence math in
 * components/recurring/meta.ts. The genuinely tricky parts (period arithmetic,
 * month-end clamping) live in that shared pure module and are NOT duplicated;
 * what is duplicated is the thin assembly around them.
 *
 * KEEP THE TWO IN STEP. If the invoice shape changes in one, change the other.
 * The durable fix is to move `generate()` into a plain `lib/` module that both
 * the action and this file call — that requires editing the actions file,
 * which was out of scope for this change.
 * ---------------------------------------------------------------------------
 *
 * Two behaviours are copied deliberately, not by accident:
 *
 *   DRAFT, always. A generated invoice is never sent or marked open by the
 *   job. Recurring billing that mails itself out unattended is how a shop
 *   bills a cancelled contract for six months.
 *
 *   ONE PERIOD PER RUN. A schedule three months overdue advances one period
 *   per pass, so it catches up over the next three passes instead of silently
 *   skipping the invoices nobody raised. Because `nextRunAt` moves forward
 *   every time, the catch-up converges and then stops on its own.
 */

/** Ceiling on one pass, so a pathological schedule set cannot run away. */
const MAX_INVOICES_PER_RUN = 200;

export type RecurringRunResult = {
  created: number;
  errors: string[];
};

/**
 * Bills every active schedule in one shop whose run date has arrived.
 *
 * Never throws for a single bad schedule: the reason is collected and the loop
 * moves on, so one schedule with no line items cannot stop the rest of the
 * shop's billing.
 */
export async function runDueRecurringInvoicesForShop(
  shopId: string,
): Promise<RecurringRunResult> {
  const due = await db.recurringInvoice.findMany({
    where: { shopId, active: true, nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: MAX_INVOICES_PER_RUN,
    select: { id: true },
  });

  let created = 0;
  const errors: string[] = [];

  for (const schedule of due) {
    try {
      const result = await generate(shopId, schedule.id);
      if (result.ok) created += 1;
      else errors.push(result.error);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "unknown recurring failure",
      );
    }
  }

  return { created, errors };
}

type GenerateResult =
  | { ok: true; invoiceId: string; number: number }
  | { ok: false; error: string };

/**
 * Stamps one DRAFT invoice out of a schedule and advances the cadence.
 *
 * The invoice, its lines and the schedule's new `nextRunAt` / `lastRunAt` all
 * move in ONE transaction, or none of them do. A crash between the two writes
 * would either bill the customer twice or never again.
 *
 * `nextRunAt` advances from the date that was *scheduled*, never from
 * `Date.now()` — a schedule run four days late still bills on the 1st next
 * month. That rule lives in advanceRunDate(); this function just honours it by
 * passing the scheduled date in.
 */
async function generate(
  shopId: string,
  scheduleId: string,
): Promise<GenerateResult> {
  const schedule = await db.recurringInvoice.findFirst({
    where: { id: scheduleId, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!schedule) return { ok: false, error: "That schedule no longer exists." };
  if (schedule.lines.length === 0) {
    return { ok: false, error: `"${schedule.name}" has no line items to bill.` };
  }

  const scheduledFor = schedule.nextRunAt;
  const nextRunAt = advanceRunDate(scheduledFor, asFrequency(schedule.frequency));
  // Terms run from the day the bill is raised, normalised to UTC midnight so
  // the printed due date reads the same in every timezone.
  const dueDate = addUtcDays(startOfUtcDay(new Date()), schedule.dueInDays);

  const invoice = await withNextNumber(shopId, "invoice", (number) =>
    db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          shopId,
          customerId: schedule.customerId,
          recurringInvoiceId: schedule.id,
          number,
          status: "DRAFT",
          taxRateBps: schedule.taxRateBps,
          dueDate,
          lines: {
            create: schedule.lines.map((line, index) => ({
              productId: line.productId,
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              taxable: line.taxable,
              sortOrder: index,
            })),
          },
        },
        select: { id: true, number: true },
      });

      await tx.recurringInvoice.update({
        where: { id: schedule.id },
        data: { nextRunAt, lastRunAt: new Date() },
      });

      return created;
    }),
  );

  return { ok: true, invoiceId: invoice.id, number: invoice.number };
}
