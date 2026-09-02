/**
 * Shared vocabulary for the time clock.
 *
 * Pure — imported by the page (server), the actions (server) and the cards
 * (client), so no `db`, no `next/*`, no "use server". Same contract as
 * components/tickets/ticket-meta.ts.
 */

/** Monday. Shops think in weeks that start on a Monday, not a Sunday. */
export const WEEK_START_DAY = 1;

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

/** Monday 00:00 local of the week containing `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const shift = (start.getDay() - WEEK_START_DAY + 7) % 7;
  start.setDate(start.getDate() - shift);
  return start;
}

/** Sunday 23:59:59.999 local of the same week. */
export function weekEnd(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** `yyyy-MM-dd` in LOCAL time — `toISOString()` would shift the day west of UTC. */
export function toDateParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reads `?week=yyyy-MM-dd` as a LOCAL day, falling back to today. */
export function parseDateParam(raw: string | undefined, fallback: Date): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? ""));
  if (!match) return fallback;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

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
