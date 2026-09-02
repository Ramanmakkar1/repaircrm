"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { withNextNumber } from "@/lib/sequence";
import { fromDateInputValue } from "@/components/billing/format";
import { resolveDocumentTax } from "@/components/billing/queries";
import { formError, parseLines, type FormState } from "@/components/billing/types";
import {
  addUtcDays,
  advanceRunDate,
  asFrequency,
  startOfUtcDay,
} from "@/components/recurring/meta";

/**
 * Recurring-billing mutations.
 *
 * `lib/` is off-limits to this module, so the generation engine lives here
 * alongside the actions that drive it. Everything is resolved with
 * `findFirst({ id, shopId })` first — a forged id from another tenant 404s
 * rather than mutating a row.
 *
 * THE CADENCE RULE
 * ----------------
 * `nextRunAt` always advances from the date that was *scheduled*, never from
 * the moment the button was pressed. A schedule run four days late still bills
 * on the 1st next month. See components/recurring/meta.ts advanceRunDate().
 */

export type RunResult =
  | { ok: true; invoiceId: string; number: number }
  | { ok: false; error: string };

const MAX_DUE_IN_DAYS = 365;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function resolveCustomer(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  return db.customer.findFirst({ where: { id, shopId }, select: { id: true } });
}

function readName(formData: FormData): string {
  return String(formData.get("name") ?? "").trim().slice(0, 120);
}

function readDueInDays(formData: FormData): number {
  const parsed = Number.parseInt(String(formData.get("dueInDays") ?? ""), 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(Math.max(parsed, 0), MAX_DUE_IN_DAYS);
}

/** Radix Switch / native checkbox submit "on" only when checked. */
function readActive(formData: FormData): boolean {
  const raw = formData.get("active");
  return raw === "on" || raw === "true" || raw === "1";
}

function lineCreateData(
  lines: { productId: string | null; description: string; quantity: number; unitPriceCents: number; taxable: boolean }[],
) {
  return lines.map((line, index) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxable: line.taxable,
    sortOrder: index,
  }));
}

function revalidateSchedule(id?: string): void {
  revalidatePath("/invoices");
  revalidatePath("/invoices/recurring");
  if (id) revalidatePath(`/invoices/recurring/${id}`);
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export async function createScheduleAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { shopId } = await requireUser();

  const name = readName(formData);
  if (!name) return formError("Give this schedule a name.");

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this schedule.");

  const nextRunAt = fromDateInputValue(formData.get("nextRunAt"));
  if (!nextRunAt) return formError("Pick the first run date.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  const tax = await resolveDocumentTax(
    shopId,
    customer.id,
    formData.get("taxRateId"),
  );

  const schedule = await db.recurringInvoice.create({
    data: {
      shopId,
      customerId: customer.id,
      name,
      frequency: asFrequency(formData.get("frequency")),
      nextRunAt,
      active: readActive(formData),
      // Snapshot the rate now, exactly like a one-off invoice: a later settings
      // change must not silently restate a contract already agreed with the
      // customer. Editing the schedule is the way to move it.
      taxRateId: tax.taxRateId,
      taxRateBps: tax.taxRateBps,
      dueInDays: readDueInDays(formData),
      lines: { create: lineCreateData(parsed.lines) },
    },
    select: { id: true },
  });

  revalidateSchedule(schedule.id);
  redirect(`/invoices/recurring/${schedule.id}`);
}

export async function updateScheduleAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const existing = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  if (!existing) return formError("That schedule no longer exists.");

  const name = readName(formData);
  if (!name) return formError("Give this schedule a name.");

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this schedule.");

  const nextRunAt = fromDateInputValue(formData.get("nextRunAt"));
  if (!nextRunAt) return formError("Pick the next run date.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  const tax = await resolveDocumentTax(
    shopId,
    customer.id,
    formData.get("taxRateId"),
  );

  // Replace-all rather than diff: line ids never reach the client, and a
  // schedule has a handful of rows, so a clean rewrite is both simpler and
  // immune to a stale id from a concurrent edit.
  await db.$transaction([
    db.recurringInvoiceLine.deleteMany({ where: { recurringInvoiceId: existing.id } }),
    db.recurringInvoice.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        taxRateId: tax.taxRateId,
        taxRateBps: tax.taxRateBps,
        name,
        frequency: asFrequency(formData.get("frequency")),
        nextRunAt,
        active: readActive(formData),
        dueInDays: readDueInDays(formData),
        lines: { create: lineCreateData(parsed.lines) },
      },
    }),
  ]);

  revalidateSchedule(existing.id);
  redirect(`/invoices/recurring/${existing.id}`);
}

// ---------------------------------------------------------------------------
// Pause / resume / delete
// ---------------------------------------------------------------------------

/** Inline switch on the list + Pause/Resume on the detail page. */
export async function setScheduleActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { shopId } = await requireUser();

  const updated = await db.recurringInvoice.updateMany({
    where: { id, shopId },
    data: { active },
  });
  if (updated.count === 0) return { ok: false, error: "That schedule no longer exists." };

  revalidateSchedule(id);
  return { ok: true };
}

export async function toggleScheduleActiveFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await setScheduleActiveAction(id, active);
}

/**
 * Deleting is OWNER-only and blocked once the schedule has stamped out an
 * invoice — the generated documents point back here, and a receivable with a
 * dangling origin is worse than a paused schedule. Deactivate instead.
 */
export async function deleteScheduleAction(formData: FormData): Promise<void> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return;

  const id = String(formData.get("id") ?? "");
  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    select: { id: true, _count: { select: { invoices: true } } },
  });
  if (!schedule) return;
  if (schedule._count.invoices > 0) return;

  await db.recurringInvoice.delete({ where: { id: schedule.id } });

  revalidateSchedule();
  redirect("/invoices/recurring");
}

// ---------------------------------------------------------------------------
// The generation engine
// ---------------------------------------------------------------------------

/**
 * Stamps one DRAFT invoice out of a schedule and advances the cadence.
 *
 * Everything that must move together moves in one transaction: the invoice and
 * its lines are written, and the schedule's `nextRunAt` / `lastRunAt` are
 * stamped, or neither happens. A crash between the two would either bill the
 * customer twice or never again.
 *
 * The invoice lands as DRAFT on purpose — recurring billing that emails itself
 * out unattended is how a shop bills a cancelled contract for six months.
 */
async function generate(shopId: string, scheduleId: string): Promise<RunResult> {
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
          // Both halves of the schedule's tax carry over, so the generated
          // invoice prints the rate's NAME ("GST 5%") and not just its number.
          taxRateId: schedule.taxRateId,
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

/** "Run now" — bills the current period immediately, on or ahead of schedule. */
export async function runRecurringInvoice(scheduleId: string): Promise<RunResult> {
  const { shopId } = await requireUser();
  const result = await generate(shopId, scheduleId);
  if (result.ok) revalidateSchedule(scheduleId);
  return result;
}

/**
 * Every active schedule whose run date has arrived, billed once each.
 *
 * FUTURE WORK: this is driven by the "Generate due now" button rather than a
 * cron. A schedule that is several periods overdue advances one period per run,
 * so it catches up one click at a time instead of silently skipping the
 * invoices nobody raised. Wiring this to a scheduled job (or a route handler
 * behind a shared secret) is the remaining piece.
 */
export async function runDueRecurringInvoices(): Promise<{
  generated: number;
  failed: number;
  errors: string[];
}> {
  const { shopId } = await requireUser();

  const due = await db.recurringInvoice.findMany({
    where: { shopId, active: true, nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    select: { id: true },
  });

  let generated = 0;
  const errors: string[] = [];

  for (const schedule of due) {
    const result = await generate(shopId, schedule.id);
    if (result.ok) generated += 1;
    else errors.push(result.error);
  }

  revalidateSchedule();
  return { generated, failed: errors.length, errors };
}
