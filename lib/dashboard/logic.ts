/**
 * Pure rules behind /dashboard ("Shop overview").
 *
 * No `db`, no `next/*`, no React: everything the page decides in words or
 * numbers is decided here, so it can be tested without a database and read in
 * one place. The loader (overview.ts) fetches rows and hands them to these
 * functions; the components only draw what comes back.
 *
 * CONVENTIONS
 *  - Money is integer cents. Whole-dollar amounts read "$40" in a sentence and
 *    every other amount reads "$40.50"; the big figures use `formatCents` so
 *    they match Reports to the cent.
 *  - "Today" is a UTC calendar day, exactly like components/reports/period.ts,
 *    so a number here is the same number on /reports for the same day.
 *  - Timestamps are epoch milliseconds, so the whole overview is plain JSON.
 *  - Words, never colour alone: every status or warning has its text here.
 */

import { refundAwareTotals, type RefundLike } from "@/components/billing/refund-math";
import { formatCents, type LineLike } from "@/lib/money";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Money in a sentence
// ---------------------------------------------------------------------------

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$40" for whole dollars, "$40.50" otherwise. For sentences only: big figures use `formatCents`. */
export function plainMoney(cents: number): string {
  const rounded = Math.round(cents);
  return rounded % 100 === 0 ? WHOLE_DOLLARS.format(rounded / 100 + 0) : formatCents(rounded);
}

// ---------------------------------------------------------------------------
// Days (UTC, like Reports)
// ---------------------------------------------------------------------------

const narrowWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "narrow" });
const longWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const dayLabelFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });

export type ReportDay = {
  /** `yyyy-mm-dd`, the UTC day. */
  key: string;
  /** Inclusive start, UTC midnight, epoch ms. */
  from: number;
  /** Exclusive end. */
  toExclusive: number;
  /** "S", "M", "T"... */
  initial: string;
  dayOfMonth: number;
  /** "Saturday". */
  weekday: string;
  /** "Saturday, Oct 3". */
  label: string;
  isToday: boolean;
};

/** The last `count` UTC days ending today, oldest first. `todayStart` is UTC midnight of today. */
export function reportDays(todayStart: number, count: number): ReportDay[] {
  return Array.from({ length: count }, (_, index) => {
    const from = todayStart - (count - 1 - index) * DAY_MS;
    const date = new Date(from);
    return {
      key: date.toISOString().slice(0, 10),
      from,
      toExclusive: from + DAY_MS,
      initial: narrowWeekday.format(date),
      dayOfMonth: date.getUTCDate(),
      weekday: longWeekday.format(date),
      label: dayLabelFormat.format(date),
      isToday: index === count - 1,
    };
  });
}

/** The Reports page for one day. */
export function reportsDayHref(key: string): string {
  return `/reports?period=custom&from=${key}&to=${key}`;
}

/** Whole calendar days (UTC) from `from` to `now`; negative while `from` is still ahead. */
export function calendarDaysSince(from: number, now: number): number {
  const a = new Date(from);
  const b = new Date(now);
  return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / DAY_MS);
}

/** "5 minutes", "3 hours", "7 days": a span in plain words. Under an hour reads "a few minutes". */
export function spanWords(ms: number): string {
  const span = Math.max(0, ms);
  if (span < HOUR_MS) return "a few minutes";
  if (span < DAY_MS) return plural(Math.floor(span / HOUR_MS), "hour");
  return plural(Math.floor(span / DAY_MS), "day");
}

// ---------------------------------------------------------------------------
// Time of day, in the shop's own time zone
// ---------------------------------------------------------------------------

/** A time zone Intl accepts, else UTC (a bad value in the database must not break the page). */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** 0-23 in the given zone. */
export function hourIn(nowMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(zone), hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour % 24 : 12;
}

/** "Good morning" (5-11), "Good afternoon" (12-16), "Good evening" (17-23), "Hello" in the small hours. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17) return "Good evening";
  return "Hello";
}

export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Saturday, October 3" in the shop's zone. */
export function longDateIn(nowMs: number, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(zone), weekday: "long", month: "long", day: "numeric" }).format(new Date(nowMs));
}

/** "Today", "Tomorrow" or "Mon, Oct 5", measured in the shop's zone. */
export function dayWords(at: number, nowMs: number, zone: string): string {
  const timeZone = safeTimeZone(zone);
  const key = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const target = key(at);
  if (target === key(nowMs)) return "Today";
  if (target === key(nowMs + DAY_MS)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(new Date(at));
}

/** "2:30 PM" in the shop's zone. */
export function timeIn(at: number, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(zone), hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

// ---------------------------------------------------------------------------
// Takings
// ---------------------------------------------------------------------------

export type PaymentRow = { amountCents: number; method: string; createdAt: number };
export type RefundRow = { amountCents: number; createdAt: number };

export type MethodGroup = "cash" | "card" | "other";

/** Cash and card get their own chip; cheque, store credit and the rest are "other". */
export function methodGroup(method: string): MethodGroup {
  if (method === "CASH") return "cash";
  if (method === "CARD") return "card";
  return "other";
}

export type DayTakings = {
  key: string;
  /** Collected that day, before refunds. */
  grossCents: number;
  refundCents: number;
  /** Collected minus refunded: the same definition as Net revenue on Reports. */
  netCents: number;
  cashCents: number;
  cardCents: number;
  otherCents: number;
};

/** One entry per day, in the order of `days`; an empty day is all zeros, never missing. */
export function dailyTakings(days: readonly ReportDay[], payments: readonly PaymentRow[], refunds: readonly RefundRow[]): DayTakings[] {
  const rows: DayTakings[] = days.map((day) => ({ key: day.key, grossCents: 0, refundCents: 0, netCents: 0, cashCents: 0, cardCents: 0, otherCents: 0 }));
  const indexOf = (at: number) => days.findIndex((day) => at >= day.from && at < day.toExclusive);
  for (const payment of payments) {
    const index = indexOf(payment.createdAt);
    if (index < 0) continue;
    const row = rows[index];
    row.grossCents += payment.amountCents;
    const group = methodGroup(payment.method);
    if (group === "cash") row.cashCents += payment.amountCents;
    else if (group === "card") row.cardCents += payment.amountCents;
    else row.otherCents += payment.amountCents;
  }
  for (const refund of refunds) {
    const index = indexOf(refund.createdAt);
    if (index >= 0) rows[index].refundCents += refund.amountCents;
  }
  for (const row of rows) row.netCents = row.grossCents - row.refundCents;
  return rows;
}

export type TakingsComparison = {
  kind: "none" | "first" | "up" | "down" | "same";
  /** The whole sentence, e.g. "$40 more than yesterday". */
  text: string;
  /** Today minus the day it is compared with (0 when there is nothing to compare). */
  deltaCents: number;
};

/**
 * Today against yesterday, in plain words.
 *
 * Yesterday is the natural comparison. When yesterday took nothing (a shop
 * closed on Sundays) the same weekday last week is used instead, so Monday is
 * measured against last Monday and not against a closed day. With neither,
 * today is the first sale of the week.
 */
export function compareTakings(input: {
  todayNetCents: number;
  todayGrossCents: number;
  yesterdayNetCents: number;
  /** The same weekday, a week ago. */
  lastWeekNetCents: number;
  /** Everything taken on the days before today in the window (a week and a day). */
  earlierNetCents: number;
  /** "Saturday". */
  weekday: string;
}): TakingsComparison {
  const { todayNetCents: today, todayGrossCents: gross, yesterdayNetCents: yesterday, lastWeekNetCents: lastWeek, earlierNetCents: earlier, weekday } = input;

  if (today === 0 && gross === 0) return { kind: "none", text: "Nothing taken yet today", deltaCents: 0 };
  if (today === 0) return { kind: "same", text: "Takings and refunds cancel out today", deltaCents: 0 };
  if (today < 0) return { kind: "down", text: "More refunded than taken today", deltaCents: today };

  const against = yesterday > 0 ? { cents: yesterday, name: "yesterday" } : lastWeek > 0 ? { cents: lastWeek, name: `last ${weekday}` } : null;
  if (!against) {
    // Nothing yesterday or a week ago, but the week was not empty: yesterday really was the lower figure.
    if (earlier > 0) return { kind: "up", text: `${plainMoney(today)} more than yesterday`, deltaCents: today };
    return { kind: "first", text: "First sale today", deltaCents: today };
  }

  const delta = today - against.cents;
  if (delta === 0) return { kind: "same", text: `Same as ${against.name}`, deltaCents: 0 };
  return { kind: delta > 0 ? "up" : "down", text: `${plainMoney(Math.abs(delta))} ${delta > 0 ? "more" : "less"} than ${against.name}`, deltaCents: delta };
}

// ---------------------------------------------------------------------------
// The repair pipeline
// ---------------------------------------------------------------------------

export type DeviceRef = { type: string; make: string | null; model: string | null };

export type PipelineTile = {
  status: string;
  count: number;
  overdue: number;
  /** Opens the Repairs list on exactly this status. */
  href: string;
  /** The oldest repairs here that have a device, at most three. */
  devices: DeviceRef[];
};

/**
 * The statuses to draw, in the shop's own order. The finished state is not
 * "on the bench", so it is left out; any status found on a repair that the
 * shop's list does not name is added at the end, so the tiles always add up to
 * every open repair.
 */
export function pipelineStatuses(configured: readonly string[], present: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const status of configured) {
    if (status === RESOLVED_STATUS || seen.has(status)) continue;
    seen.add(status);
    out.push(status);
  }
  const extra = [...new Set(present)].filter((status) => status !== RESOLVED_STATUS && !seen.has(status)).sort((a, b) => a.localeCompare(b));
  return [...out, ...extra];
}

export function repairsStatusHref(status: string): string {
  return `/tickets?status=${encodeURIComponent(status)}`;
}

export function buildPipeline(input: {
  statuses: readonly string[];
  counts: Readonly<Record<string, number>>;
  overdue: Readonly<Record<string, number>>;
  devices: Readonly<Record<string, readonly DeviceRef[]>>;
}): PipelineTile[] {
  return input.statuses.map((status) => ({
    status,
    count: input.counts[status] ?? 0,
    overdue: input.overdue[status] ?? 0,
    href: repairsStatusHref(status),
    devices: [...(input.devices[status] ?? [])].slice(0, 3),
  }));
}

/** "12 open repairs. 9 are late." in words, with the small cases spelled out. */
export function benchSentence(open: number, late: number): string {
  if (open <= 0) return "Nothing is on the bench.";
  const head = `${plural(open, "open repair")}.`;
  if (late <= 0) return `${head} None are late.`;
  if (late >= open) return open === 1 ? `${head} It is late.` : `${head} All are late.`;
  return late === 1 ? `${head} 1 is late.` : `${head} ${late} are late.`;
}

/** A technician's own line: "You have 4 open repairs. 1 is late." */
export function myQueueSentence(open: number, late: number): string {
  if (open <= 0) return "You have no open repairs.";
  const head = `You have ${plural(open, "open repair")}.`;
  if (late <= 0) return `${head} None are late.`;
  if (late >= open) return open === 1 ? `${head} It is late.` : `${head} All are late.`;
  return late === 1 ? `${head} 1 is late.` : `${head} ${late} are late.`;
}

// ---------------------------------------------------------------------------
// Time to finish
// ---------------------------------------------------------------------------

export type FinishSummary = { count: number; meanMs: number };

/** Mean intake-to-resolved time. A negative span is bad data (a back-dated resolve) and is skipped, as on Reports. */
export function averageFinish(spans: readonly { createdAt: number; resolvedAt: number }[]): FinishSummary {
  const durations = spans.map((span) => span.resolvedAt - span.createdAt).filter((ms) => ms >= 0);
  if (durations.length === 0) return { count: 0, meanMs: 0 };
  return { count: durations.length, meanMs: Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) };
}

/** "3.2 days", "1 day", "5 hours", "40 minutes". */
export function finishWords(ms: number): string {
  if (ms >= DAY_MS) {
    const days = Math.round((ms / DAY_MS) * 10) / 10;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? "day" : "days"}`;
  }
  if (ms >= HOUR_MS) return plural(Math.round(ms / HOUR_MS), "hour");
  return plural(Math.max(1, Math.round(ms / 60_000)), "minute");
}

// ---------------------------------------------------------------------------
// Who is working on what
// ---------------------------------------------------------------------------

export type WorkloadRow = {
  /** null: nobody has these. */
  userId: string | null;
  name: string;
  open: number;
  late: number;
  /** The Repairs list filtered to this person. */
  href: string;
  /** "Maria Wong: 5 open, 2 late". */
  words: string;
};

export const UNASSIGNED_KEY = "";

export function workloadWords(name: string, open: number, late: number): string {
  if (open <= 0) return `${name}: nothing open`;
  return `${name}: ${open} open${late > 0 ? `, ${late} late` : ""}`;
}

/**
 * One row per technician who has open repairs, plus every active technician
 * even at zero (free hands are worth seeing), plus "Not assigned" when some
 * repairs belong to nobody. Biggest load first; the unassigned row leads
 * because work nobody owns is the one that slips.
 */
export function buildWorkload(input: {
  users: readonly { id: string; name: string; role: string; active: boolean }[];
  openByUser: Readonly<Record<string, number>>;
  lateByUser: Readonly<Record<string, number>>;
  limit?: number;
}): { rows: WorkloadRow[]; hidden: number } {
  const { users, openByUser, lateByUser } = input;
  const limit = input.limit ?? 6;
  const rows: WorkloadRow[] = [];

  for (const user of users) {
    const open = openByUser[user.id] ?? 0;
    if (open === 0 && !(user.active && user.role === "TECH")) continue;
    const late = lateByUser[user.id] ?? 0;
    rows.push({ userId: user.id, name: user.name, open, late, href: `/tickets?tech=${encodeURIComponent(user.id)}`, words: workloadWords(user.name, open, late) });
  }
  rows.sort((a, b) => b.open - a.open || b.late - a.late || a.name.localeCompare(b.name));

  const unassigned = openByUser[UNASSIGNED_KEY] ?? 0;
  const late = lateByUser[UNASSIGNED_KEY] ?? 0;
  const all = unassigned > 0 ? [{ userId: null, name: "Not assigned", open: unassigned, late, href: "/tickets?tech=unassigned", words: workloadWords("Not assigned", unassigned, late) }, ...rows] : rows;
  return { rows: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
}

// ---------------------------------------------------------------------------
// Popular repairs and top products
// ---------------------------------------------------------------------------

export type PopularRow = { label: string; count: number };

/** The problem types of the period, most common first. Spellings that differ only by case are one type; a blank one is "Other". */
export function popularProblems(groups: readonly { problemType: string; count: number }[], limit = 5): PopularRow[] {
  const merged = new Map<string, { label: string; count: number }>();
  for (const group of groups) {
    const label = group.problemType.trim() || "Other";
    const key = label.toLowerCase();
    const entry = merged.get(key);
    if (entry) entry.count += group.count;
    else merged.set(key, { label, count: group.count });
  }
  return [...merged.values()]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export type ProductLine = { productId: string | null; name: string; quantity: number; unitPriceCents: number };
export type TopProduct = { productId: string | null; name: string; units: number; cents: number };

/**
 * Revenue by product, as Reports' "Top products": quantity times unit price (tax
 * excluded), grouped by product name, biggest first.
 */
export function topProducts(lines: readonly ProductLine[], limit = 5): TopProduct[] {
  const byName = new Map<string, TopProduct>();
  for (const line of lines) {
    const name = line.name || "Unnamed product";
    const entry = byName.get(name) ?? { productId: line.productId, name, units: 0, cents: 0 };
    entry.units += line.quantity;
    entry.cents += line.quantity * line.unitPriceCents;
    byName.set(name, entry);
  }
  return [...byName.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Owed to you
// ---------------------------------------------------------------------------

export type OwedInvoice = {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  /** A tel: link, or null when the customer has no number. */
  callHref: string | null;
  dueAt: number | null;
  taxRateBps: number;
  lines: readonly LineLike[];
  payments: readonly { amountCents: number }[];
  refunds: readonly RefundLike[];
};

export type OwedCustomer = { customerId: string; name: string; cents: number; invoices: number; callHref: string | null };
export type LateInvoice = { id: string; number: number; customerId: string; customerName: string; dueAt: number; daysLate: number; balanceCents: number };

export type OwedSummary = {
  totalCents: number;
  /** Invoices that still owe something. */
  count: number;
  /** Invoices past their due day. */
  overdueCount: number;
  customers: OwedCustomer[];
  lateInvoices: LateInvoice[];
};

/** How many whole days past due (UTC calendar days), 0 when not late or today is the due day. */
export function invoiceDaysLate(dueAt: number | null, now: number): number {
  if (dueAt == null || dueAt >= now) return 0;
  return Math.max(0, calendarDaysSince(dueAt, now));
}

/**
 * What customers owe, the way the invoices list reads it: the balance of each
 * unpaid invoice is total minus payments plus refunds paid back out, so a
 * refunded invoice owes again. An overpaid invoice never cancels another's debt.
 */
export function summariseOwed(invoices: readonly OwedInvoice[], now: number, options: { customerLimit?: number; lateLimit?: number } = {}): OwedSummary {
  const customerLimit = options.customerLimit ?? 3;
  const lateLimit = options.lateLimit ?? 6;
  let totalCents = 0;
  let count = 0;
  let overdueCount = 0;
  const customers = new Map<string, OwedCustomer>();
  const late: LateInvoice[] = [];

  for (const invoice of invoices) {
    const { balanceCents } = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
    if (balanceCents <= 0) continue;
    totalCents += balanceCents;
    count += 1;

    const entry = customers.get(invoice.customerId) ?? { customerId: invoice.customerId, name: invoice.customerName, cents: 0, invoices: 0, callHref: invoice.callHref };
    entry.cents += balanceCents;
    entry.invoices += 1;
    customers.set(invoice.customerId, entry);

    const daysLate = invoiceDaysLate(invoice.dueAt, now);
    if (daysLate >= 1 && invoice.dueAt != null) {
      overdueCount += 1;
      late.push({ id: invoice.id, number: invoice.number, customerId: invoice.customerId, customerName: invoice.customerName, dueAt: invoice.dueAt, daysLate, balanceCents });
    }
  }

  return {
    totalCents,
    count,
    overdueCount,
    customers: [...customers.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)).slice(0, customerLimit),
    lateInvoices: late.sort((a, b) => b.daysLate - a.daysLate || b.balanceCents - a.balanceCents).slice(0, lateLimit),
  };
}

// ---------------------------------------------------------------------------
// Needs you now
// ---------------------------------------------------------------------------

export type NeedsYouKind = "overdue-repair" | "ready-unpaid" | "ready-waiting" | "invoice-late" | "reply" | "low-stock";

/** The picture on a row. */
export type NeedsYouVisual =
  | { kind: "device"; device: DeviceRef | null; label: string }
  | { kind: "product"; productId: string; name: string; category: string | null; catalogImage: string | null; imageUrl: string | null }
  | { kind: "person"; name: string };

export type NeedsYouRow = {
  key: string;
  kind: NeedsYouKind;
  /** The repair this row is about, when it is about one: a repair never gets two rows. */
  ticketId?: string;
  /** Words for the small label on the row: "Overdue", "Ready", "Unpaid"... */
  tag: string;
  score: number;
  sentence: string;
  visual: NeedsYouVisual;
  action: { label: string; href: string; /** A tel: link, not a page. */ call?: boolean };
};

export type OverdueRepair = { id: string; number: number; customer: string; device: DeviceRef | null; deviceLabel: string | null; dueAt: number; priority: string };
export type ReadyRepair = {
  id: string;
  number: number;
  customer: string;
  device: DeviceRef | null;
  deviceLabel: string | null;
  readySince: number;
  callHref: string | null;
  /** null when the viewer may not see money, else what is still owed (0 when settled). */
  dueCents: number | null;
  invoiceId: string | null;
};
export type ReplyWaiting = { id: string; number: number; customer: string; device: DeviceRef | null; deviceLabel: string | null; since: number };
export type LowStockItem = {
  id: string;
  name: string;
  stockQty: number;
  lowStockAt: number | null;
  vendorId: string | null;
  category: string | null;
  catalogImage: string | null;
  imageUrl: string | null;
};

/** Most rows of each kind, so one busy queue cannot push everything else off the list. */
const KIND_CAP: Record<NeedsYouKind, number> = { "overdue-repair": 3, "ready-unpaid": 3, "ready-waiting": 2, "invoice-late": 3, reply: 3, "low-stock": 2 };

export const NEEDS_YOU_LIMIT = 6;

const deviceOrRepair = (label: string | null, number: number) => label ?? `Repair #${number}`;

export function orderMoreHref(input: { canOrder: boolean; productId: string; vendorId: string | null }): string {
  if (!input.canOrder) return `/inventory/${input.productId}`;
  return input.vendorId ? `/inventory/purchase-orders/new?vendorId=${encodeURIComponent(input.vendorId)}` : "/inventory/purchase-orders/new";
}

/** "Out of stock" / "2 left". */
export function stockLeftWords(stockQty: number): string {
  return stockQty <= 0 ? "Out of stock" : `${stockQty} left`;
}

export function buildNeedsYou(input: {
  now: number;
  /** May this viewer see and act on money (invoices, what is owed)? */
  showMoney: boolean;
  /** May this viewer raise purchase orders (owners)? */
  canOrder: boolean;
  overdueRepairs: readonly OverdueRepair[];
  readyRepairs: readonly ReadyRepair[];
  lateInvoices: readonly LateInvoice[];
  replies: readonly ReplyWaiting[];
  lowStock: readonly LowStockItem[];
  limit?: number;
}): { rows: NeedsYouRow[]; candidates: number } {
  const { now, showMoney, canOrder } = input;
  const rows: NeedsYouRow[] = [];

  for (const repair of input.overdueRepairs) {
    const late = Math.max(0, now - repair.dueAt);
    const label = repair.deviceLabel ?? `Repair #${repair.number}`;
    rows.push({
      key: `overdue:${repair.id}`,
      kind: "overdue-repair",
      ticketId: repair.id,
      tag: "Overdue",
      score: 1000 + Math.min(Math.floor(late / DAY_MS), 60) * 10 + (repair.priority === "URGENT" ? 100 : repair.priority === "HIGH" ? 40 : 0),
      sentence: `${label} for ${repair.customer} is ${spanWords(late)} late.`,
      visual: { kind: "device", device: repair.device, label },
      action: { label: "Open", href: `/tickets/${repair.id}` },
    });
  }

  for (const repair of input.readyRepairs) {
    const waited = Math.max(0, now - repair.readySince);
    const days = Math.floor(waited / DAY_MS);
    const label = deviceOrRepair(repair.deviceLabel, repair.number);
    const visual: NeedsYouVisual = { kind: "device", device: repair.device, label };
    if (showMoney && repair.dueCents != null && repair.dueCents > 0) {
      rows.push({
        key: `ready-unpaid:${repair.id}`,
        kind: "ready-unpaid",
        ticketId: repair.id,
        tag: "Unpaid",
        score: 950 + Math.min(days, 30) * 8 + Math.min(Math.floor(repair.dueCents / 10_000), 50),
        sentence: `${repair.customer} can collect their ${repair.deviceLabel ?? "device"}, but still owes ${plainMoney(repair.dueCents)}.`,
        visual,
        action: { label: "Take payment", href: repair.invoiceId ? `/invoices/${repair.invoiceId}` : `/tickets/${repair.id}` },
      });
    } else if (days >= 3) {
      rows.push({
        key: `ready-waiting:${repair.id}`,
        kind: "ready-waiting",
        ticketId: repair.id,
        tag: "Ready",
        score: 700 + Math.min(days, 60) * 5,
        sentence: `${label} has been ready for ${plural(days, "day")}. ${repair.customer} has not collected it.`,
        visual,
        action: repair.callHref ? { label: "Call", href: repair.callHref, call: true } : { label: "Open", href: `/tickets/${repair.id}` },
      });
    }
  }

  if (showMoney) {
    for (const invoice of input.lateInvoices) {
      rows.push({
        key: `invoice:${invoice.id}`,
        kind: "invoice-late",
        tag: "Unpaid",
        score: 900 + Math.min(invoice.daysLate, 90) * 3 + Math.min(Math.floor(invoice.balanceCents / 10_000), 100),
        sentence: `Invoice #${invoice.number} for ${invoice.customerName} is ${plural(invoice.daysLate, "day")} late: ${plainMoney(invoice.balanceCents)} owed.`,
        visual: { kind: "person", name: invoice.customerName },
        action: { label: "Take payment", href: `/invoices/${invoice.id}` },
      });
    }
  }

  for (const reply of input.replies) {
    const hours = Math.max(0, Math.floor((now - reply.since) / HOUR_MS));
    const label = reply.deviceLabel ?? "their repair";
    rows.push({
      key: `reply:${reply.id}`,
      kind: "reply",
      ticketId: reply.id,
      tag: "Reply",
      score: 650 + Math.min(hours, 96),
      sentence: `${reply.customer} is waiting for a reply about ${label}.`,
      visual: { kind: "device", device: reply.device, label: reply.deviceLabel ?? `Repair #${reply.number}` },
      action: { label: "Reply", href: `/tickets/${reply.id}` },
    });
  }

  for (const item of input.lowStock) {
    const out = item.stockQty <= 0;
    rows.push({
      key: `stock:${item.id}`,
      kind: "low-stock",
      tag: "Low stock",
      score: out ? 500 : 400,
      sentence: out ? `${item.name} is out of stock.` : `${item.name}: only ${item.stockQty} left${item.lowStockAt != null ? ` (reorder at ${item.lowStockAt})` : ""}.`,
      visual: { kind: "product", productId: item.id, name: item.name, category: item.category, catalogImage: item.catalogImage, imageUrl: item.imageUrl },
      action: { label: canOrder ? "Order more" : "Open", href: orderMoreHref({ canOrder, productId: item.id, vendorId: item.vendorId }) },
    });
  }

  // One row per repair: when a repair is both late and ready, say the most pressing thing once.
  const bestForTicket = new Map<string, NeedsYouRow>();
  for (const row of rows) {
    if (!row.ticketId) continue;
    const best = bestForTicket.get(row.ticketId);
    if (!best || row.score > best.score) bestForTicket.set(row.ticketId, row);
  }
  const unique = rows.filter((row) => !row.ticketId || bestForTicket.get(row.ticketId) === row);

  return { rows: rankNeedsYou(unique, input.limit ?? NEEDS_YOU_LIMIT), candidates: unique.length };
}

/** Highest score first, never more than the cap of one kind, at most `limit` rows. */
export function rankNeedsYou(rows: readonly NeedsYouRow[], limit = NEEDS_YOU_LIMIT): NeedsYouRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const taken: Record<string, number> = {};
  const out: NeedsYouRow[] = [];
  for (const row of sorted) {
    if (out.length >= limit) break;
    if ((taken[row.kind] ?? 0) >= KIND_CAP[row.kind]) continue;
    taken[row.kind] = (taken[row.kind] ?? 0) + 1;
    out.push(row);
  }
  return out;
}
