/**
 * The shop's own clock: "today", day boundaries and dates in words, read in the
 * time zone saved on the shop (`Shop.timezone`, Settings), never the server's.
 *
 * Why: the server runs in UTC (pinned to America/Edmonton only as a stop-gap)
 * while every shop is somewhere else, so a bare `startOfDay(new Date())` or a
 * date-fns `format(date, "MMM d")` on the server cuts the day at the server's
 * midnight and prints the server's wall clock. A repair due at 7pm in Edmonton
 * would read "Due Oct 5" (UTC) for a job due on the evening of Oct 4.
 *
 * Pure and client-safe: no `db`, no `next/*`. A Server Component reads the zone
 * from the shop row and hands it down; a client piece that formats a date takes
 * the same zone as a prop, so the server render and the hydrated one print the
 * same words.
 *
 * The day maths (`dayKeyIn`, `startOfZonedDay`, `reportDays`, `safeTimeZone`)
 * already lives in lib/dashboard/logic.ts, which Shop overview is built on, and
 * is re-exported here rather than copied so the two can never disagree about
 * where a day starts.
 */

import { dayKeyIn, reportDays, safeTimeZone, startOfZonedDay } from "@/lib/dashboard/logic";

export { dayKeyIn, safeTimeZone, startOfZonedDay };

const DAY_MS = 86_400_000;

/** One instant read off the wall in a zone. `month` is 1-12, `weekday` 0 (Sunday) to 6. */
export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const wallFormats = new Map<string, Intl.DateTimeFormat>();

function wallFormat(zone: string): Intl.DateTimeFormat {
  let format = wallFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    wallFormats.set(zone, format);
  }
  return format;
}

const toMs = (at: Date | number | string): number => (typeof at === "number" ? at : new Date(at).getTime());

/**
 * The zone to read a clock in. A shop always has one (the column defaults to
 * America/Edmonton); a caller that has none to give (a screen outside the shop's
 * pages that has not been handed the zone yet) gets the runtime's own zone,
 * which is exactly what date-fns `format` did before, so nothing changes for it.
 * A value Intl does not know falls back to UTC, as on Shop overview.
 */
export function resolveZone(zone: string | null | undefined): string {
  if (zone) return safeTimeZone(zone);
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** What the clock on the shop's wall reads at an instant. */
export function wallClockIn(at: Date | number | string, zone: string | null | undefined): WallClock {
  const parts = wallFormat(resolveZone(zone)).formatToParts(new Date(toMs(at)));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return {
    year,
    month,
    day,
    hour: part("hour") % 24,
    minute: part("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/**
 * The date-fns tokens the app's screens use, read on the shop's wall:
 * yyyy, MMMM, MMM, MM, M, dd, d, EEEE, EEE, HH, H, hh, h, mm and a (AM/PM).
 * Anything else is copied as it is; quote a literal that contains those letters
 * ('at').
 */
const TOKENS = /yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|a|'[^']*'/g;

/**
 * `format(date, pattern)` from date-fns, but in the shop's time zone, and the
 * same on the server and in the browser. An invalid date gives "".
 *
 *   formatInZone(dueDate, "MMM d", "America/Edmonton")          "Oct 4"
 *   formatInZone(createdAt, "MMM d, yyyy h:mm a", shopZone)     "Oct 4, 2026 7:30 PM"
 */
export function formatInZone(at: Date | number | string, pattern: string, zone: string | null | undefined): string {
  const ms = toMs(at);
  if (!Number.isFinite(ms)) return "";
  const wall = wallClockIn(ms, zone);
  const hour12 = wall.hour % 12 === 0 ? 12 : wall.hour % 12;
  return pattern.replace(TOKENS, (token) => {
    switch (token) {
      case "yyyy": return String(wall.year);
      case "MMMM": return MONTHS[wall.month - 1];
      case "MMM": return MONTHS[wall.month - 1].slice(0, 3);
      case "MM": return pad(wall.month);
      case "M": return String(wall.month);
      case "dd": return pad(wall.day);
      case "d": return String(wall.day);
      case "EEEE": return WEEKDAYS[wall.weekday];
      case "EEE": return WEEKDAYS[wall.weekday].slice(0, 3);
      case "HH": return pad(wall.hour);
      case "H": return String(wall.hour);
      case "hh": return pad(hour12);
      case "h": return String(hour12);
      case "mm": return pad(wall.minute);
      case "a": return wall.hour < 12 ? "AM" : "PM";
      default: return token.slice(1, -1);
    }
  });
}

/** Today on the shop's calendar: its `yyyy-mm-dd` key and the instants it starts and ends. */
export function zonedToday(nowMs: number, zone: string | null | undefined): { key: string; from: number; toExclusive: number } {
  const [{ key, from, toExclusive }] = reportDays(nowMs, resolveZone(zone), 1);
  return { key, from, toExclusive };
}

/**
 * Whole calendar days on the shop's wall from `from` to `to`: 0 the same day,
 * 1 for "yesterday", negative while `from` is still ahead. A job finished at
 * 11pm last night is one day ago at 8am, whatever the server's midnight says.
 */
export function zonedCalendarDays(from: Date | number, to: Date | number, zone: string | null | undefined): number {
  const tz = resolveZone(zone);
  const a = Date.parse(dayKeyIn(toMs(from), tz));
  const b = Date.parse(dayKeyIn(toMs(to), tz));
  return Math.round((b - a) / DAY_MS);
}

/** Both instants fall in the same year on the shop's calendar. */
export function sameZonedYear(a: Date | number, b: Date | number, zone: string | null | undefined): boolean {
  return wallClockIn(a, zone).year === wallClockIn(b, zone).year;
}

/**
 * "Oct 4" this year, "Oct 4, 2025" once the year differs, on the shop's calendar:
 * an old date never reads as a recent one.
 */
export function shortDateIn(at: Date | number, nowMs: number, zone: string | null | undefined): string {
  return formatInZone(at, sameZonedYear(at, nowMs, zone) ? "MMM d" : "MMM d, yyyy", zone);
}

/**
 * A `<input type="date">` value ("2026-10-04") as the instant that day starts in
 * the shop's zone, or null for anything that is not a real calendar date. The
 * same day reads back as the same day through `formatInZone(.., "yyyy-MM-dd")`.
 */
export function parseZonedDateInput(value: string, zone: string | null | undefined): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return null;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(startOfZonedDay(year, month, day, resolveZone(zone)));
}
