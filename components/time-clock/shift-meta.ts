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

/** "9:14 AM – 12:30 PM", or "9:14 AM – now" while the shift is still running. */
export function shiftRange(clockIn: Date, clockOut: Date | null): string {
  return `${format(clockIn, "h:mm a")} – ${clockOut ? format(clockOut, "h:mm a") : "now"}`;
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
