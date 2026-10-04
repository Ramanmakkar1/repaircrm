import { dayKeyIn, safeTimeZone, startOfZonedDay } from "@/lib/dashboard/logic";

/**
 * Dates and times on the Settings screens, always on the shop's own clock.
 *
 * These render on the server first (where the process zone is not the shop's)
 * and then hydrate in the browser (where the zone is whatever the tablet says),
 * so a formatter without an explicit zone shows two different times and React
 * calls that a mismatch. Every formatter here takes the shop's IANA zone
 * (`Shop.timezone`) and a fixed en-US locale, so both sides agree and both are
 * right for the shop.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string, options: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const timeZone = safeTimeZone(zone);
  const id = `${timeZone}|${key}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formats.set(id, format);
  }
  return format;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 4, 2026, 2:30 PM" on the shop's clock; an em dash when missing. */
export function shopDateTime(value: string | Date | null | undefined, zone: string): string {
  const date = toDate(value);
  return date
    ? formatter(zone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, "dt").format(date)
    : "—";
}

/** "Oct 4, 2026" on the shop's calendar. */
export function shopDate(value: string | Date | null | undefined, zone: string): string {
  const date = toDate(value);
  return date ? formatter(zone, { month: "short", day: "numeric", year: "numeric" }, "d").format(date) : "—";
}

/** "2:30 PM" on the shop's clock. */
export function shopTime(value: string | Date | null | undefined, zone: string): string {
  const date = toDate(value);
  return date ? formatter(zone, { hour: "numeric", minute: "2-digit" }, "t").format(date) : "—";
}

/** The calendar day before `key` ("2026-10-04" -> "2026-10-03"), by date, not by 24 hours. */
export function previousDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** "Today", "Yesterday" or "Friday, October 2", for an instant on the shop's calendar. */
export function dayHeading(at: string | Date, nowMs: number, zone: string): string {
  const date = toDate(at);
  if (!date) return "Earlier";
  const key = dayKeyIn(date.getTime(), zone);
  const today = dayKeyIn(nowMs, zone);
  if (key === today) return "Today";
  if (key === previousDayKey(today)) return "Yesterday";
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatter(
    zone,
    sameYear ? { weekday: "long", month: "long", day: "numeric" } : { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    sameYear ? "head" : "head-y",
  ).format(date);
}

/**
 * Splits a newest-first list into days on the shop's calendar, keeping the
 * order. Rows with a missing date land in the day of the row before them.
 */
export function groupByShopDay<T extends { createdAt: string }>(
  rows: readonly T[],
  nowMs: number,
  zone: string,
): { key: string; heading: string; rows: T[] }[] {
  const groups: { key: string; heading: string; rows: T[] }[] = [];
  for (const row of rows) {
    const date = toDate(row.createdAt);
    const key = date ? dayKeyIn(date.getTime(), zone) : (groups.at(-1)?.key ?? "unknown");
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.rows.push(row);
      continue;
    }
    groups.push({ key, heading: date ? dayHeading(date, nowMs, zone) : "Earlier", rows: [row] });
  }
  return groups;
}

/** "a few minutes ago", "3 hours ago", "2 days ago": how long since an instant. */
export function agoWords(value: string | Date | null | undefined, nowMs: number): string {
  const date = toDate(value);
  if (!date) return "never";
  const minutes = Math.floor((nowMs - date.getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The first instant of the current month on the shop's calendar, as a Date.
 * "Sent this month" counts from here, not from midnight wherever the server is.
 */
export function startOfShopMonth(nowMs: number, zone: string): Date {
  const [year, month] = dayKeyIn(nowMs, zone).split("-").map(Number);
  return new Date(startOfZonedDay(year, month, 1, safeTimeZone(zone)));
}

/** The shop zones an owner picks from: the common ones for the shops we serve, by plain name. */
export const COMMON_TIME_ZONES: readonly { zone: string; label: string }[] = [
  { zone: "America/St_Johns", label: "Newfoundland (St. John's)" },
  { zone: "America/Halifax", label: "Atlantic (Halifax)" },
  { zone: "America/New_York", label: "Eastern (Toronto, New York)" },
  { zone: "America/Chicago", label: "Central (Winnipeg, Chicago)" },
  { zone: "America/Regina", label: "Saskatchewan (Regina)" },
  { zone: "America/Edmonton", label: "Mountain (Edmonton, Calgary)" },
  { zone: "America/Denver", label: "Mountain US (Denver)" },
  { zone: "America/Phoenix", label: "Arizona (Phoenix)" },
  { zone: "America/Vancouver", label: "Pacific (Vancouver, Los Angeles)" },
  { zone: "America/Anchorage", label: "Alaska (Anchorage)" },
  { zone: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { zone: "Europe/London", label: "UK (London)" },
  { zone: "Europe/Dublin", label: "Ireland (Dublin)" },
  { zone: "Australia/Sydney", label: "Australia East (Sydney)" },
  { zone: "Australia/Perth", label: "Australia West (Perth)" },
  { zone: "Pacific/Auckland", label: "New Zealand (Auckland)" },
  { zone: "Asia/Kolkata", label: "India (Kolkata)" },
  { zone: "UTC", label: "UTC" },
];

/** The choices for the shop's zone: the common list, plus the current one when it is not on it. */
export function timeZoneChoices(current: string): { zone: string; label: string }[] {
  const known = COMMON_TIME_ZONES.some((item) => item.zone === current);
  return known || !current ? [...COMMON_TIME_ZONES] : [{ zone: current, label: current.replace(/_/g, " ") }, ...COMMON_TIME_ZONES];
}
