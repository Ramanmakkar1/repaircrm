/**
 * Shared vocabulary for the time clock.
 *
 * Pure — imported by the page (server), the actions (server) and the cards
 * (client), so no `db`, no `next/*`, no "use server". Same contract as
 * components/tickets/ticket-meta.ts.
 */

import { addDaysToKey, dayKeyIn, dayWindow, mondayOfKey, parseDayKey } from "@/lib/dashboard/zone";

/** Monday. Shops think in weeks that start on a Monday, not a Sunday. */
export const WEEK_START_DAY = 1;

export type ShopWeek = {
  /** Today on the shop's calendar. */
  todayKey: string;
  /** Monday and Sunday of the week on screen ("2026-09-28"). */
  monday: string;
  sunday: string;
  /** The instants that week covers in the shop's zone: Monday's midnight to the one after Sunday. */
  from: Date;
  toExclusive: Date;
  /** The instants today covers. */
  todayFrom: Date;
  todayToExclusive: Date;
  isThisWeek: boolean;
};

/**
 * The week a `?week=yyyy-MM-dd` asks for (this week when it is missing or not
 * a date), cut on the SHOP'S calendar: a shift clocked in at 11pm Sunday in
 * Edmonton belongs to that Sunday's week, whatever the server's clock says.
 */
export function shopWeek(raw: string | null | undefined, nowMs: number, zone: string): ShopWeek {
  const todayKey = dayKeyIn(nowMs, zone);
  const anchor = raw && parseDayKey(raw) ? raw.trim() : todayKey;
  const monday = mondayOfKey(anchor);
  const sunday = addDaysToKey(monday, 6);
  const today = dayWindow(todayKey, zone);
  return {
    todayKey,
    monday,
    sunday,
    from: new Date(dayWindow(monday, zone).from),
    toExclusive: new Date(dayWindow(sunday, zone).toExclusive),
    todayFrom: new Date(today.from),
    todayToExclusive: new Date(today.toExclusive),
    isThisWeek: monday === mondayOfKey(todayKey),
  };
}

export type TimeClockEntryRow = {
  id: string;
  userId: string;
  userName: string;
  /** ISO strings: a Date cannot cross into a Client Component intact. */
  clockInISO: string;
  clockOutISO: string | null;
  note: string | null;
  /** Seconds worked; for a running entry, up to the render's clock. */
  seconds: number;
};

/**
 * Seconds -> "7h 45m". Payroll reads hours and minutes; nobody has ever cared
 * that a shift was 7h 45m 12s.
 */
export function formatHours(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Seconds -> "07:45:12", for the ticker on a running shift. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Decimal hours to two places — what a payroll spreadsheet actually wants. */
export function decimalHours(totalSeconds: number): string {
  return (Math.max(0, totalSeconds) / 3600).toFixed(2);
}

/** Whole seconds between two instants, floored at zero. */
export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}
