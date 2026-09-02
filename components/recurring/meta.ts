/**
 * Shared, dependency-free vocabulary for recurring billing schedules.
 *
 * Imported by BOTH the server actions and the client form, so this file must
 * stay pure: no `db`, no `next/*`, no "use server". (The tone import below is
 * type-only, so it is erased before any of that matters.)
 */

import type { StatusTone } from "@/components/ui/badge";

export const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/** "every 3 months" — used in the detail card's plain-English summary. */
export const FREQUENCY_CADENCE: Record<Frequency, string> = {
  WEEKLY: "every 7 days",
  MONTHLY: "every month",
  QUARTERLY: "every 3 months",
  YEARLY: "every 12 months",
};

/** Plain `{ value, label }` data — a label *function* cannot cross to a client. */
export const FREQUENCY_OPTIONS = FREQUENCIES.map((value) => ({
  value: value as string,
  label: FREQUENCY_LABEL[value],
}));

export function asFrequency(value: unknown): Frequency {
  return FREQUENCIES.includes(value as Frequency)
    ? (value as Frequency)
    : "MONTHLY";
}

export function frequencyLabel(value: unknown): string {
  return FREQUENCY_LABEL[asFrequency(value)];
}

// ---------------------------------------------------------------------------
// Schedule state
// ---------------------------------------------------------------------------

/**
 * The three things a schedule can be, in the app-wide tone language.
 *
 * "Due" is deliberately amber rather than red: a contract whose run date has
 * arrived is work waiting to be done, not a failure — the red on these screens
 * is reserved for a charge that actually bounced.
 */
export type ScheduleState = "active" | "due" | "paused";

export const SCHEDULE_STATE_META: Record<
  ScheduleState,
  { label: string; tone: StatusTone }
> = {
  active: { label: "Active", tone: "success" },
  due: { label: "Due now", tone: "active" },
  paused: { label: "Paused", tone: "neutral" },
};

export function scheduleState(active: boolean, due: boolean): ScheduleState {
  if (!active) return "paused";
  return due ? "due" : "active";
}

// ---------------------------------------------------------------------------
// Cadence math
// ---------------------------------------------------------------------------

/** Whole months each frequency advances. WEEKLY is handled separately. */
const MONTH_STEP: Record<Frequency, number> = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** UTC midnight of the calendar day `date` falls on. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * The next run date, one whole period after `from`.
 *
 * ALWAYS called with the *scheduled* date, never with `Date.now()` — running a
 * schedule three days late must not push every future invoice three days out.
 * The cadence is anchored to the calendar, not to when staff got around to it.
 *
 * Month arithmetic is done in UTC (dates are stored at UTC midnight) and clamps
 * to the last day of the target month, so a schedule anchored on the 31st bills
 * on Feb 28 rather than silently rolling into March 3rd.
 */
export function advanceRunDate(from: Date, frequency: Frequency): Date {
  const next = startOfUtcDay(from);

  if (frequency === "WEEKLY") return addUtcDays(next, 7);

  const anchorDay = next.getUTCDate();
  // Park on the 1st first: setUTCMonth on the 31st would overflow the month.
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + MONTH_STEP[frequency]);

  const lastDayOfMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, lastDayOfMonth));

  return next;
}

/** A schedule is "due" when it is switched on and its run date has arrived. */
export function isDue(
  nextRunAt: Date | string,
  active: boolean,
  now: number = Date.now(),
): boolean {
  if (!active) return false;
  const at = nextRunAt instanceof Date ? nextRunAt : new Date(nextRunAt);
  return !Number.isNaN(at.getTime()) && at.getTime() <= now;
}
