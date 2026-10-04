/**
 * The words and numbers behind Cash drawers (/pos/drawers) and the printed
 * end-of-day report.
 *
 * Pure: no `db`, no React. Times are the shop's own clock (`Shop.timezone`),
 * never the server's, and every amount is integer cents.
 */

import { formatCents } from "@/lib/money";
import { safeTimeZone } from "@/lib/dashboard/logic";
import { drawerVerdict, type DrawerVerdict } from "./drawer-types";

// ---------------------------------------------------------------- dates ----

const dayFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** "Sat, Oct 3" on the shop's calendar. */
export function shopDayLabel(at: Date, zone: string | null | undefined): string {
  const tz = safeTimeZone(zone);
  let format = dayFormats.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    dayFormats.set(tz, format);
  }
  return format.format(at);
}

/** "8:00 AM" on the shop's clock. */
export function shopClockLabel(at: Date, zone: string | null | undefined): string {
  const tz = safeTimeZone(zone);
  let format = timeFormats.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    timeFormats.set(tz, format);
  }
  return format.format(at);
}

// --------------------------------------------------------------- a card ----

export type DrawerSessionRow = {
  openedAt: Date;
  closedAt: Date | null;
  openingCents: number;
  expectedCents: number | null;
  countedCents: number | null;
};

export type DrawerCardWords = {
  /** "Short $1.34", "Over $2.00", "Balanced", "Open now". */
  title: string;
  verdict: DrawerVerdict | "open";
  /** counted − expected; null while open or not counted. */
  differenceCents: number | null;
  /** "Sat, Oct 3 · 8:00 AM – 6:12 PM" (or "… – still open"). */
  when: string;
};

/** A drawer session in plain words: the verdict and the amount lead. */
export function drawerCardWords(session: DrawerSessionRow, zone: string | null | undefined): DrawerCardWords {
  const counted =
    session.closedAt !== null && session.countedCents !== null && session.expectedCents !== null;
  const differenceCents = counted ? (session.countedCents as number) - (session.expectedCents as number) : null;
  const verdict = differenceCents === null ? "open" : drawerVerdict(differenceCents);
  const title =
    verdict === "open"
      ? session.closedAt
        ? "Closed, not counted"
        : "Open now"
      : verdict === "balanced"
        ? "Balanced"
        : `${verdict === "short" ? "Short" : "Over"} ${formatCents(Math.abs(differenceCents ?? 0))}`;
  const when = `${shopDayLabel(session.openedAt, zone)} · ${shopClockLabel(session.openedAt, zone)} – ${
    session.closedAt ? shopClockLabel(session.closedAt, zone) : "still open"
  }`;
  return { title, verdict, differenceCents, when };
}

// --------------------------------------------------------------- views -----

export const DRAWER_VIEWS = [
  { value: "", label: "All" },
  { value: "short", label: "Short" },
  { value: "over", label: "Over" },
  { value: "balanced", label: "Balanced" },
] as const;

export type DrawerView = (typeof DRAWER_VIEWS)[number]["value"];

export function asDrawerView(raw: string | string[] | undefined): DrawerView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return DRAWER_VIEWS.find((view) => view.value === value)?.value ?? "";
}

/** How many drawers are in each view (the number inside each tab). */
export function drawerViewCounts(sessions: readonly DrawerSessionRow[], zone: string | null | undefined): Record<DrawerView, number> {
  const counts: Record<DrawerView, number> = { "": sessions.length, short: 0, over: 0, balanced: 0 };
  for (const session of sessions) {
    const { verdict } = drawerCardWords(session, zone);
    if (verdict !== "open") counts[verdict] += 1;
  }
  return counts;
}

/** "Off 3 times in the last 40 drawers": how often the till did not balance. */
export function drawerOffSentence(counts: Record<DrawerView, number>): string {
  const closed = counts.short + counts.over + counts.balanced;
  if (closed === 0) return "No drawer has been counted yet.";
  const off = counts.short + counts.over;
  if (off === 0) return `Every one of the last ${closed} counted ${closed === 1 ? "drawer" : "drawers"} balanced.`;
  return `Off ${off} ${off === 1 ? "time" : "times"} in the last ${closed} counted ${closed === 1 ? "drawer" : "drawers"}: ${counts.short} short, ${counts.over} over.`;
}

// ------------------------------------------------------------- takings -----

export type MethodTotal = { method: string; cents: number; count: number };

/** The order a counter reads its takings in. */
const METHOD_ORDER = ["CASH", "CARD", "CHECK", "CREDIT", "OTHER"];

/**
 * What came in while a drawer was open, by how people paid, with the refunds
 * given back and the total after them (the same "money in after refunds" as
 * Reports and the Shop overview). Every method appears, even at $0.00, so a
 * report reads the same every day.
 */
export function drawerTakings(
  payments: readonly MethodTotal[],
  refunds: readonly MethodTotal[],
): { rows: MethodTotal[]; grossCents: number; refundCents: number; refundCount: number; netCents: number } {
  const byMethod = new Map<string, MethodTotal>();
  for (const method of METHOD_ORDER) byMethod.set(method, { method, cents: 0, count: 0 });
  for (const row of payments) {
    const entry = byMethod.get(row.method) ?? { method: row.method, cents: 0, count: 0 };
    entry.cents += row.cents;
    entry.count += row.count;
    byMethod.set(row.method, entry);
  }
  const rows = [...byMethod.values()];
  const grossCents = rows.reduce((sum, row) => sum + row.cents, 0);
  const refundCents = refunds.reduce((sum, row) => sum + row.cents, 0);
  const refundCount = refunds.reduce((sum, row) => sum + row.count, 0);
  return { rows, grossCents, refundCents, refundCount, netCents: grossCents - refundCents };
}
