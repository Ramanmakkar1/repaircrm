/**
 * Dates on the stock and purchasing screens, in the SHOP's time zone.
 *
 * The server's own zone is an accident of where it runs (UTC in production,
 * pinned to America/Edmonton as a stop-gap), so nothing here reads it. "Today",
 * "late" and every printed time are taken from `Shop.timezone`.
 *
 * Two kinds of date live on a purchase order and they are treated differently:
 *
 *  - An INSTANT (orderedAt, receivedAt, a stock move's createdAt) is a moment.
 *    It is shown on the shop's wall clock: `formatInstant`, `formatInstantDay`.
 *  - A CALENDAR DAY (expectedAt, "it should arrive on Oct 4") is a date with no
 *    time. It is stored as UTC midnight of that day (`parseDayInput`) and read
 *    back by its UTC date (`dayKeyOf`), so it means the same day whatever zone
 *    renders it. Rows written before this rule (server-local midnight, which in
 *    every North American zone is still the same UTC date) read back correctly.
 *
 * Pure: no db, no next/*. Zone maths is reused from the dashboard, which owns
 * the tested implementation.
 */

import { dayKeyIn, safeTimeZone } from "@/lib/dashboard/logic";

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `yyyy-mm-dd` from an `<input type="date">` -> UTC midnight of that day, or null. */
export function parseDayInput(raw: unknown): Date | null {
  const match = DAY_INPUT.exec(String(raw ?? "").trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // 2026-02-31 rolls into March: that is not the day that was typed.
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date;
}

/** The calendar day a stored day-only date stands for, as `yyyy-mm-dd`. */
export function dayKeyOf(day: Date | null | undefined): string | null {
  if (!day || Number.isNaN(day.getTime())) return null;
  return day.toISOString().slice(0, 10);
}

/** A stored day-only date -> the value an `<input type="date">` wants. */
export function dayInputValue(day: Date | null | undefined): string {
  return dayKeyOf(day) ?? "";
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DAY_LABEL_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 4, 2026" for a day-only date (no zone involved: it is a calendar day). */
export function formatDay(day: Date | null | undefined, options: { year?: boolean } = {}): string {
  if (!day || Number.isNaN(day.getTime())) return "—";
  return (options.year === false ? DAY_LABEL_SHORT : DAY_LABEL).format(day);
}

/** Today's `yyyy-mm-dd` on the shop's wall calendar. */
export function shopTodayKey(nowMs: number, zone: string | null | undefined): string {
  return dayKeyIn(nowMs, safeTimeZone(zone));
}

/**
 * Is a delivery late? Only an order still out with the supplier can be, and only
 * once the promised day is over on the SHOP's calendar: on Oct 4 itself it is due
 * today, not late.
 */
export function isLate(order: { status: string; expectedAt: Date | null }, todayKey: string): boolean {
  if (order.status !== "ORDERED" && order.status !== "PARTIAL") return false;
  const due = dayKeyOf(order.expectedAt);
  return due !== null && due < todayKey;
}

/** "Oct 4, 2026 · 2:30 PM" on the shop's wall clock. */
export function formatInstant(at: Date | null | undefined, zone: string | null | undefined): string {
  if (!at || Number.isNaN(at.getTime())) return "—";
  const timeZone = safeTimeZone(zone);
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  return `${day} · ${time}`;
}

/** "Oct 4, 2026": the shop's calendar day an instant fell on. */
export function formatInstantDay(at: Date | null | undefined, zone: string | null | undefined): string {
  if (!at || Number.isNaN(at.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(zone), month: "short", day: "numeric", year: "numeric" }).format(at);
}
