/**
 * The words on the time-clock screen, worked out in one place.
 *
 * Pure (no React, no `db`, no `next/*`) so they can be tested without
 * rendering anything. The pieces that show them are `clock-panel.tsx` (the big
 * button) and `shift-cards.tsx` (today's shifts and the team's week).
 */

import { format } from "date-fns";

import {
  formatClock,
  formatHours,
  secondsBetween,
} from "@/app/(app)/time-clock/meta";
import { dayKeyIn, formatIn, wallClock, wallDateTimeValue, zonedInstant } from "@/lib/dashboard/zone";

/** "9:14 AM" on the shop's clock (or the runtime's, when no zone is given). */
export function clockTime(at: Date, zone?: string): string {
  return zone ? formatIn(at.getTime(), zone, { hour: "numeric", minute: "2-digit" }) : format(at, "h:mm a");
}

/** "Tue Sep 29": the day a shift started, on the shop's calendar. */
export function shiftDay(at: Date, zone?: string): string {
  return zone
    ? formatIn(at.getTime(), zone, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")
    : format(at, "EEE MMM d");
}

/** "9:14 AM – 12:30 PM", or "9:14 AM – now" while the shift is still running. */
export function shiftRange(clockIn: Date, clockOut: Date | null, zone?: string): string {
  return `${clockTime(clockIn, zone)} – ${clockOut ? clockTime(clockOut, zone) : "now"}`;
}

/** A shift still running after this long has almost certainly been forgotten. */
export const FORGOTTEN_AFTER_SECONDS = 14 * 3600;

export type ForgottenShift = {
  /** "Wed Sep 30, 9:02 AM". */
  since: string;
  /** "86h 15m". */
  running: string;
  /** A sensible clock-out for the fix dialog: 6 PM that day, or 8 hours in when it started late. `yyyy-MM-ddTHH:mm`. */
  suggestedOut: string;
  /** "6:00 PM": the suggestion in words. */
  suggestedLabel: string;
};

/**
 * A shift somebody forgot to close: still running, and either started on an
 * earlier day of the shop's calendar or open for 14 hours or more. Without this
 * an 86-hour "Running" shift reads like any other.
 */
export function forgottenShift(
  entry: { clockInAt: Date; clockOutAt: Date | null },
  now: Date,
  zone: string,
): ForgottenShift | null {
  if (entry.clockOutAt) return null;
  const seconds = secondsBetween(entry.clockInAt, now);
  const earlierDay = dayKeyIn(entry.clockInAt.getTime(), zone) < dayKeyIn(now.getTime(), zone);
  if (!earlierDay && seconds < FORGOTTEN_AFTER_SECONDS) return null;

  const start = wallClock(entry.clockInAt.getTime(), zone);
  const sixPm = zonedInstant(start.year, start.month, start.day, 18, 0, zone);
  const out = start.hour < 17 ? sixPm : entry.clockInAt.getTime() + 8 * 3600_000;
  return {
    since: `${shiftDay(entry.clockInAt, zone)}, ${clockTime(entry.clockInAt, zone)}`,
    running: formatHours(seconds),
    suggestedOut: wallDateTimeValue(out, zone),
    suggestedLabel: clockTime(new Date(out), zone),
  };
}

/** Seconds worked in one shift; a running one counts up to `now`. */
export function shiftSeconds(
  entry: { clockInAt: Date; clockOutAt: Date | null },
  now: Date,
): number {
  return secondsBetween(entry.clockInAt, entry.clockOutAt ?? now);
}

export type ClockPanelCopy = {
  /** The state, in words - never colour alone. */
  status: "On the clock" | "Clocked out";
  /** The big number: a ticking clock while running, today's hours otherwise. */
  figure: string;
  /** One quiet line under the number. */
  caption: string;
  /** What pressing the one big button will do. */
  action: "Clock in" | "Clock out";
  /** The same button while the server is working. */
  busyAction: "Clocking in…" | "Clocking out…";
};

export function clockPanelCopy({
  running,
  openSinceLabel,
  todaySeconds,
  weekSeconds,
  elapsedSeconds,
}: {
  running: boolean;
  /** "9:14 AM", formatted on the server against the shop's clock. */
  openSinceLabel: string | null;
  /** Completed seconds today (a running shift is not in here). */
  todaySeconds: number;
  weekSeconds: number;
  /** Seconds since the running shift started; 0 when not running. */
  elapsedSeconds: number;
}): ClockPanelCopy {
  if (running) {
    return {
      status: "On the clock",
      figure: formatClock(elapsedSeconds),
      caption: `Since ${openSinceLabel ?? "now"} · ${formatHours(todaySeconds + elapsedSeconds)} today`,
      action: "Clock out",
      busyAction: "Clocking out…",
    };
  }
  return {
    status: "Clocked out",
    figure: formatHours(todaySeconds),
    caption: `worked today · ${formatHours(weekSeconds)} this week`,
    action: "Clock in",
    busyAction: "Clocking in…",
  };
}
