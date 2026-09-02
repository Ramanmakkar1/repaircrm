import { appUrl } from "@/lib/comms/config";
import { invoiceMessage } from "@/lib/comms/documents";
import { deliverEmail } from "@/lib/comms/drivers";
import { sendEmail } from "@/lib/comms";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
// Imported from the leaf modules rather than the @/lib/payments barrel: the
// barrel also carries the webhook and Connect code, which pulls `node:crypto`
// into the graph Next compiles for the Edge runtime — a build warning for a
// dependency this file never uses.
import { chargeCardOnFile } from "@/lib/payments/card-on-file";
import { paymentsLive } from "@/lib/payments/config";
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
 * DRAFT REMAINS THE DEFAULT. A generated invoice is not sent and not charged
 * unless the schedule was explicitly told to do so — recurring billing that
 * mails itself out unattended is how a shop bills a cancelled contract for six
 * months. `autoSend` and `autoCharge` are per-schedule, off unless someone
 * turned them on, and auto-charge additionally requires a card on file (the
 * editor disables the switch, and the action re-checks).
 *
 * ONE PERIOD PER RUN. A schedule three months overdue advances one period per
 * pass, so it catches up over the next three passes instead of silently
 * skipping the invoices nobody raised. Because `nextRunAt` moves forward every
 * time, the catch-up converges and then stops on its own.
 */

/** Ceiling on one pass, so a pathological schedule set cannot run away. */
const MAX_INVOICES_PER_RUN = 200;

export type RecurringRunResult = {
  created: number;
  charges: { attempted: number; succeeded: number; failed: number };
  errors: string[];
};

/**
 * Bills every active schedule in one shop whose run date has arrived.
 *
 * Never throws for a single bad schedule: the reason is collected and the loop
 * moves on, so one schedule with no line items — or one declined card — cannot
 * stop the rest of the shop's billing.
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
  const charges = { attempted: 0, succeeded: 0, failed: 0 };
  const errors: string[] = [];

  for (const schedule of due) {
    try {
      const result = await generate(shopId, schedule.id);
      if (!result.ok) {
        errors.push(result.error);
        continue;
      }
      created += 1;

      // Delivery first, money second. The customer should have the invoice in
      // front of them before their card is touched, and a mail provider having
      // a bad afternoon must not stop the shop being paid.
      if (result.autoSend) {
        const problem = await autoSendInvoice(shopId, result.invoiceId);
        if (problem) errors.push(`invoice #${result.number}: ${problem}`);
      }

      if (result.autoCharge) {
        charges.attempted += 1;
        const outcome = await autoChargeInvoice({
          shopId,
          scheduleId: schedule.id,
          scheduleName: result.name,
          invoiceId: result.invoiceId,
          invoiceNumber: result.number,
        });
        if (outcome.ok) {
          charges.succeeded += 1;
        } else {
          charges.failed += 1;
          errors.push(`invoice #${result.number}: ${outcome.error}`);
        }
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "unknown recurring failure",
      );
    }
  }

  return { created, charges, errors };
}

type GenerateResult =
  | {
      ok: true;
      invoiceId: string;
      number: number;
      name: string;
      autoSend: boolean;
      autoCharge: boolean;
    }
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

  return {
    ok: true,
    invoiceId: invoice.id,
    number: invoice.number,
    name: schedule.name,
    autoSend: schedule.autoSend,
    autoCharge: schedule.autoCharge,
  };
}

// ---------------------------------------------------------------------------
// Auto-send
// ---------------------------------------------------------------------------

/**
 * Emails a freshly generated invoice, exactly the way the Send dialog does.
 *
 * Same composer (`invoiceMessage`), same delivery core (`sendEmail`, which is
 * the ONE place a CommunicationLog row is written), same DRAFT → SENT rule:
 * only a delivery that actually left the building earns SENT, so an opted-out
 * customer leaves the invoice honestly a draft for someone to look at.
 *
 * Returns a reason when the customer could not be reached, or null on success.
 */
async function autoSendInvoice(
  shopId: string,
  invoiceId: string,
): Promise<string | null> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      dueDate: true,
      taxRateBps: true,
      publicToken: true,
      customerId: true,
      customer: { select: { firstName: true, email: true, emailOptIn: true } },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      shop: { select: { name: true } },
    },
  });
  if (!invoice) return "that invoice vanished before it could be sent";

  if (!invoice.customer.emailOptIn) return "the customer has opted out of email";
  if (!invoice.customer.email) return "there is no email address on file";

  const totals = invoiceTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
  );

  const message = invoiceMessage({
    shopName: invoice.shop.name,
    customerFirstName: invoice.customer.firstName,
    number: invoice.number,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    lineCount: invoice.lines.length,
    totalCents: totals.totalCents,
    balanceCents: totals.balanceCents,
  });

  const result = await sendEmail({
    shopId,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    subject: message.subject,
    body: message.emailBody,
    summary: message.summary,
    context: message.context,
    portalPath: message.portalPath,
    // The link is a `/portal/i/<token>` URL, which does not spell the invoice
    // id out — so the caller has to declare that it lands on this invoice.
    // `paymentsLive()` still has the final say inside lib/comms.
    linkTargetsInvoice: paymentsLive() && totals.balanceCents > 0,
  });

  if (!result.ok) return `email ${result.status}`;

  if (invoice.status === "DRAFT") {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT" },
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auto-charge
// ---------------------------------------------------------------------------

/**
 * Charges a generated invoice to the customer's card on file.
 *
 * A DECLINE IS NOT A SILENT EVENT. Nobody is watching a 3am timer tick, so a
 * failure is recorded in two places that a human will actually meet:
 *
 *   `RecurringInvoice.lastChargeError`  a red chip on the schedule list, and
 *   an email to every active owner       in their inbox the next morning.
 *
 * The field is cleared on the next success, so the chip disappears by itself
 * once the customer's new card goes through.
 */
async function autoChargeInvoice(input: {
  shopId: string;
  scheduleId: string;
  scheduleName: string;
  invoiceId: string;
  invoiceNumber: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await chargeCardOnFile({
    shopId: input.shopId,
    invoiceId: input.invoiceId,
    // No cashier: this ran on a timer.
    takenById: null,
  });

  if (result.ok && result.outcome.status !== "error") {
    await db.recurringInvoice.updateMany({
      where: { id: input.scheduleId, shopId: input.shopId },
      data: { lastChargeError: null },
    });
    return { ok: true };
  }

  const reason = result.ok
    ? "the card was charged but the payment could not be filed"
    : result.reason;

  await db.recurringInvoice.updateMany({
    where: { id: input.scheduleId, shopId: input.shopId },
    data: { lastChargeError: reason.slice(0, 500) },
  });

  await notifyOwners(input, reason);
  return { ok: false, error: reason };
}

/**
 * Tells the shop's owners a scheduled charge failed.
 *
 * Straight through `deliverEmail` rather than `sendEmail`: this is staff mail,
 * and the outbox is the CUSTOMER's communication history. Filing an internal
 * alert there would put a message the customer never received into the record
 * of what they were told.
 *
 * Never throws — an SMTP problem must not turn a declined card into a failed
 * automation run.
 */
async function notifyOwners(
  input: {
    shopId: string;
    scheduleName: string;
    invoiceId: string;
    invoiceNumber: number;
  },
  reason: string,
): Promise<void> {
  try {
    const [owners, invoice] = await Promise.all([
      db.user.findMany({
        where: { shopId: input.shopId, role: "OWNER", active: true },
        select: { email: true, name: true },
      }),
      db.invoice.findFirst({
        where: { id: input.invoiceId, shopId: input.shopId },
        select: {
          lines: {
            select: { quantity: true, unitPriceCents: true, taxable: true },
          },
          taxRateBps: true,
          customer: {
            select: { firstName: true, lastName: true, businessName: true },
          },
        },
      }),
    ]);
    if (owners.length === 0 || !invoice) return;

    const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, []);
    const customerName =
      invoice.customer.businessName ||
      `${invoice.customer.firstName} ${invoice.customer.lastName}`;
    const link = `${appUrl()}/invoices/${input.invoiceId}`;

    const subject = `Automatic payment failed — invoice #${input.invoiceNumber}`;
    const text = [
      `The card on file for ${customerName} could not be charged.`,
      "",
      `Schedule:  ${input.scheduleName}`,
      `Invoice:   #${input.invoiceNumber} for ${formatCents(totals.totalCents)}`,
      `Reason:    ${reason}`,
      "",
      "The invoice was still raised and is waiting for payment:",
      link,
      "",
      "Nothing was charged. Ask the customer for a new card, or take the payment another way.",
    ].join("\n");

    const html = `<div style="font:15px system-ui,sans-serif;line-height:1.6;color:#1f2329">
<p>The card on file for <strong>${escapeHtml(customerName)}</strong> could not be charged.</p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:2px 16px 2px 0;color:#6b7280">Schedule</td><td>${escapeHtml(input.scheduleName)}</td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#6b7280">Invoice</td><td>#${input.invoiceNumber} for ${formatCents(totals.totalCents)}</td></tr>
<tr><td style="padding:2px 16px 2px 0;color:#6b7280">Reason</td><td>${escapeHtml(reason)}</td></tr>
</table>
<p>The invoice was still raised and is waiting for payment:<br><a href="${link}">${link}</a></p>
<p style="color:#6b7280">Nothing was charged. Ask the customer for a new card, or take the payment another way.</p>
</div>`;

    for (const owner of owners) {
      if (!owner.email) continue;
      await deliverEmail({ to: owner.email, subject, text, html });
    }
  } catch (error) {
    console.error("[jobs] could not notify owners of a failed charge:", error);
  }
}

/** Minimal escaping — these strings are shop and customer names, not markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
