import { formatCents } from "@/lib/money";

/**
 * The plain-words lines on an Invoice / Estimate / Recurring card in Easy mode.
 *
 * Pure on purpose: every sentence a card shows ("Raised Sep 18 - due Oct 2",
 * "$450.00 due", "Paid") is decided here from plain values, so the rules are
 * unit-tested and the card components stay layout only. The clock is passed in
 * (the page reads it once through `requestNow`) so nothing here is impure.
 *
 * Dates are formatted in UTC for the same reason `formatDate` is: a due date is
 * stored as a bare calendar day at UTC midnight and must not slip a day when it
 * is read back in another timezone.
 */

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_MS = 86_400_000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sep 18" this year, "Sep 18, 2025" for any other year. An empty string when there is no date. */
export function shortDay(value: Date | string | null | undefined, now: number): string {
  const date = toDate(value);
  if (!date) return "";
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return (sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(date);
}

/** Whole calendar days (UTC) from `from` to `now`; negative while `from` is still ahead. */
function calendarDaysSince(from: Date, now: number): number {
  const today = new Date(now);
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * How late an unpaid invoice is, in words: "Due today", "1 day overdue",
 * "12 days overdue". Null when it is not late (or there is no due date).
 * "Late" is the same rule the table's red date uses: the due day has started
 * and money is still owed.
 */
export function overdueLabel(
  dueDate: Date | string | null | undefined,
  balanceCents: number,
  now: number,
): string | null {
  const due = toDate(dueDate);
  if (!due || balanceCents <= 0 || due.getTime() >= now) return null;
  const days = calendarDaysSince(due, now);
  if (days <= 0) return "Due today";
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

export type MoneyTone = "owed" | "overdue" | "paid" | "muted";

export interface MoneyLine {
  text: string;
  tone: MoneyTone;
}

/**
 * The second line under an invoice's total. When money is owed it says how much
 * in words ("$450.00 due"); otherwise it says why nothing is owed.
 * `balanceCents` is the refund-aware balance, so a part-refunded invoice never
 * reads "Paid" beside a "Partial" badge.
 */
export function invoiceMoneyLine(input: {
  status: string;
  balanceCents: number;
  overdue: boolean;
}): MoneyLine {
  if (input.status === "VOID") return { text: "Voided", tone: "muted" };
  if (input.status === "DRAFT") return { text: "Not sent yet", tone: "muted" };
  if (input.balanceCents <= 0) return { text: "Paid", tone: "paid" };
  return { text: `${formatCents(input.balanceCents)} due`, tone: input.overdue ? "overdue" : "owed" };
}

export interface CardLine {
  /** The calm part: "Raised Sep 18". */
  lead: string;
  /** The date that may need chasing: "due Oct 2". Rendered with emphasis when `late`. */
  tail: string | null;
  late: boolean;
}

/** "Raised Sep 18 - due Oct 2", "Paid Aug 28", "Started Sep 18" for a draft. */
export function invoiceCardLine(
  input: {
    status: string;
    createdAt: Date | string;
    dueDate: Date | string | null;
    paidAt: Date | string | null;
    balanceCents: number;
  },
  now: number,
): CardLine {
  const raised = shortDay(input.createdAt, now);
  const settled = input.status !== "VOID" && input.status !== "DRAFT" && input.balanceCents <= 0;

  if (settled) {
    const paid = shortDay(input.paidAt, now);
    return { lead: paid ? `Paid ${paid}` : `Raised ${raised}`, tail: null, late: false };
  }
  if (input.status === "DRAFT") return { lead: `Started ${raised}`, tail: null, late: false };
  if (input.status === "VOID") return { lead: `Raised ${raised}`, tail: null, late: false };

  const due = shortDay(input.dueDate, now);
  const late = overdueLabel(input.dueDate, input.balanceCents, now) !== null;
  return { lead: `Raised ${raised}`, tail: due ? `due ${due}` : null, late };
}

/** What happens next to a quote, in a few plain words, for the line under its total. */
export function estimateMoneyLine(status: string): MoneyLine {
  switch (status) {
    case "DRAFT":
      return { text: "Not sent yet", tone: "muted" };
    case "SENT":
      return { text: "Waiting for a yes", tone: "owed" };
    case "APPROVED":
      return { text: "Ready to bill", tone: "paid" };
    case "DECLINED":
      return { text: "Turned down", tone: "muted" };
    case "CONVERTED":
      return { text: "Now an invoice", tone: "muted" };
    default:
      return { text: "", tone: "muted" };
  }
}

/** "Written Sep 18 - expires Oct 2". Open quotes show an expiry; settled ones are just history. */
export function estimateCardLine(
  input: {
    status: string;
    createdAt: Date | string;
    expiresAt: Date | string | null;
    approvedAt: Date | string | null;
  },
  now: number,
): CardLine {
  const written = shortDay(input.createdAt, now);
  const approved = shortDay(input.approvedAt, now);
  const open = input.status === "DRAFT" || input.status === "SENT";
  const lead = approved && (input.status === "APPROVED" || input.status === "CONVERTED") ? `Approved ${approved}` : `Written ${written}`;

  const expires = toDate(input.expiresAt);
  if (!open || !expires) return { lead, tail: null, late: false };

  const late = expires.getTime() < now;
  return { lead, tail: `${late ? "expired" : "expires"} ${shortDay(expires, now)}`, late };
}

/** "Every month - next on Oct 15"; a paused schedule has no next date worth showing. */
export function scheduleCardLine(
  input: { cadence: string; nextRunAt: Date | string; active: boolean; due: boolean },
  now: number,
): CardLine {
  if (!input.active) return { lead: input.cadence, tail: null, late: false };
  const next = shortDay(input.nextRunAt, now);
  return { lead: input.cadence, tail: input.due ? `was due ${next}` : `next on ${next}`, late: input.due };
}

/** One chip for what a schedule does by itself, or null when it does nothing unattended. */
export function autoLabel(autoSend: boolean, autoCharge: boolean): string | null {
  if (autoSend && autoCharge) return "Sends and charges itself";
  if (autoSend) return "Sends itself";
  if (autoCharge) return "Charges itself";
  return null;
}

/** "3 invoices so far" / "1 invoice so far" / "No invoices yet". */
export function invoicesSoFar(count: number): string {
  if (count <= 0) return "No invoices yet";
  return count === 1 ? "1 invoice so far" : `${count} invoices so far`;
}

/**
 * The number inside each tab of the Invoices list, from one `groupBy` on status.
 * Keys are the tab values: "" is All, "unpaid" is sent plus part-paid (the same
 * set Home and the dashboard count), the rest are the stored statuses.
 */
export function invoiceTabCounts(
  rows: ReadonlyArray<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + row._count._all;
  counts[""] = rows.reduce((sum, row) => sum + row._count._all, 0);
  counts["unpaid"] = (counts["SENT"] ?? 0) + (counts["PARTIAL"] ?? 0);
  return counts;
}

/** The same for the Estimates list, which has no combined view. */
export function estimateTabCounts(
  rows: ReadonlyArray<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + row._count._all;
  counts[""] = rows.reduce((sum, row) => sum + row._count._all, 0);
  return counts;
}

/** Does a recurring schedule match what was typed? Name or customer, any case, any part. */
export function matchesSchedule(query: string, fields: ReadonlyArray<string>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field.toLowerCase().includes(needle));
}

/** "every month" -> "Every month". */
export function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
