/**
 * The shop's own clock, for the money screens and the paperwork.
 *
 * The server's process zone is not the shop's zone (a live server runs in UTC,
 * every live shop so far is in America/Edmonton), so nothing here reads the
 * process zone. Every helper takes the zone saved on the shop (`Shop.timezone`)
 * and a bad or missing value falls back to UTC rather than breaking a page.
 *
 * TWO KINDS OF DATE live in billing, and they need different handling:
 *
 *   - INSTANTS (createdAt, paidAt, a payment's time): a moment. Shown in the
 *     shop's zone, so a 9pm Saturday sale reads Saturday, not the UTC Sunday.
 *     `formatDate(value, zone)` in ./format does that.
 *   - CALENDAR DAYS (an invoice's due date, a quote's expiry): stored as that
 *     day at UTC midnight (./format `fromDateInputValue`), so they are always
 *     read in UTC and never shift.
 *
 * To compare the two ("is this invoice late?", "Paid Sep 25") the instant is
 * moved onto the shop's wall clock with `shopWall` / `shopNow`: a Date whose
 * UTC fields read what the clock on the shop's wall reads. The existing UTC
 * calendar rules (record-format.ts, bill-display.ts) then give the shop's
 * answer. Those shifted values are for display and day maths only; they are
 * never stored and never sent back to the database.
 *
 * Pure: no `db`, no `next/*`. The day-boundary maths is the Shop overview's
 * (lib/dashboard/logic.ts), reused so Reports, statements and the overview cut
 * a day at exactly the same instant.
 */

import { dayKeyIn, safeTimeZone as checkZone, startOfZonedDay } from "@/lib/dashboard/logic";

const checkedZones = new Map<string, string>();

/** The shop's zone if Intl knows it, else UTC; each zone is checked once per process. */
function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  let safe = checkedZones.get(zone);
  if (safe === undefined) {
    safe = checkZone(zone);
    checkedZones.set(zone, safe);
  }
  return safe;
}

const DAY_MS = 86_400_000;

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
      second: "numeric",
    });
    wallFormats.set(zone, format);
  }
  return format;
}

/** The shop's wall-clock reading at an instant, as the same reading at UTC (epoch ms). */
export function wallMs(ms: number, zone: string | null | undefined): number {
  const tz = safeTimeZone(zone);
  if (tz === "UTC") return ms;
  const parts = wallFormat(tz).formatToParts(new Date(ms));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const millis = ((ms % 1000) + 1000) % 1000;
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second")) + millis;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * An instant moved onto the shop's wall clock, for the UTC calendar rules in
 * billing. Null when there is no date. DISPLAY ONLY: never store the result.
 */
export function shopWall(value: Date | string | number | null | undefined, zone: string | null | undefined): Date | null {
  const date = toDate(value);
  return date ? new Date(wallMs(date.getTime(), zone)) : null;
}

/** "Now" on the shop's wall clock (see `shopWall`): the `now` every calendar rule in billing takes. */
export function shopNow(nowMs: number, zone: string | null | undefined): number {
  return wallMs(nowMs, zone);
}

/** `yyyy-mm-dd`: today on the shop's calendar. */
export function shopTodayKey(nowMs: number, zone: string | null | undefined): string {
  return dayKeyIn(nowMs, safeTimeZone(zone));
}

/** `yyyy-mm-dd` plus whole calendar days (negative goes back). */
export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `fromKey` to `toKey` (negative while `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const at = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((at(toKey) - at(fromKey)) / DAY_MS);
}

/** The instant the shop's calendar day `yyyy-mm-dd` begins: midnight in the shop's zone. */
export function shopDayStart(key: string, zone: string | null | undefined): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(startOfZonedDay(year, month, day, safeTimeZone(zone)));
}

/**
 * A run of shop calendar days, `fromKey` to `toKey` INCLUSIVE, as the instants a
 * query needs (`gte from`, `lt toExclusive`). A day with a clock change is 23 or
 * 25 hours long and is still cut at the shop's own midnight.
 */
export function shopDayRange(
  fromKey: string,
  toKey: string,
  zone: string | null | undefined,
): { from: Date; toExclusive: Date } {
  return { from: shopDayStart(fromKey, zone), toExclusive: shopDayStart(addDaysToKey(toKey, 1), zone) };
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** "2:30 PM" in the shop's zone; an em dash when there is no time. */
export function shopTime(value: Date | string | number | null | undefined, zone: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const tz = safeTimeZone(zone);
  let format = timeFormats.get(tz);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    timeFormats.set(tz, format);
  }
  return format.format(date);
}
