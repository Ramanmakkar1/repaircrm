/**
 * The shop's own clock and calendar, whatever zone the server runs in.
 *
 * Pure: no `db`, no `next/*`, no React, so the server pages, the server actions
 * and the client booking dialog can all use it. Every function takes the zone
 * (`Shop.timezone`, an IANA name such as "America/Edmonton") and reads the wall
 * clock there through `Intl`, never through the process's own zone: the live
 * server runs in UTC while the shops do not.
 *
 * Two kinds of value travel through here:
 *  - an INSTANT: epoch milliseconds (or a Date), the moment something happens;
 *  - a WALL reading: a calendar day "yyyy-MM-dd" and a time "HH:mm" as the
 *    clock on the shop's wall shows them.
 * Converting between the two always names the zone.
 */

const HOUR_MS = 3_600_000;

/** A time zone Intl accepts, else UTC (a bad value in the database must not break the page). */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

export type WallClock = {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  /** 0-23. */
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** The same wall reading as if it were a UTC timestamp: handy for offsets. */
  asUtc: number;
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
      second: "numeric",
    });
    wallFormats.set(zone, format);
  }
  return format;
}

/** The clock on the wall in `zone` at an instant. */
export function wallClock(ms: number, zone: string): WallClock {
  const tz = safeTimeZone(zone);
  const parts = wallFormat(tz).formatToParts(new Date(ms));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour") % 24;
  const minute = part("minute");
  const second = part("second");
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    asUtc: Date.UTC(year, month - 1, day, hour, minute, second),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "yyyy-MM-dd" from calendar parts (month 1-12). Rolls over: day 32 is the 1st of the next month. */
export function dayKeyOf(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `yyyy-mm-dd` of an instant on the shop's wall calendar. */
export function dayKeyIn(ms: number, zone: string): string {
  const { year, month, day } = wallClock(ms, zone);
  return dayKeyOf(year, month, day);
}

/** The parts of a "yyyy-MM-dd" key, or null when it is not one. */
export function parseDayKey(key: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((key ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // "2026-02-31" is not a day: refuse it rather than quietly reading March 3.
  if (dayKeyOf(year, month, day) !== `${match[1]}-${match[2]}-${match[3]}`) return null;
  return { year, month, day };
}

/** The day key `days` calendar days after (or before) `key`. */
export function addDaysToKey(key: string, days: number): string {
  const parts = parseDayKey(key);
  if (!parts) return key;
  return dayKeyOf(parts.year, parts.month, parts.day + days);
}

/** 0 = Sunday ... 6 = Saturday, for a day key. */
export function weekdayOfKey(key: string): number {
  const parts = parseDayKey(key);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** Monday of the week holding `key` (shops count weeks from Monday). */
export function mondayOfKey(key: string): string {
  return addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
}

/**
 * The instant a wall reading happens in `zone`: "Oct 4, 9:30 AM in Edmonton".
 * The zone's offset is read where the moment falls, so a day with a clock
 * change is still right. A time skipped by a clock change (2:30 AM on the
 * morning the clocks go forward) lands an hour later, the way a wall clock does.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): number {
  const tz = safeTimeZone(zone);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms: number) => wallClock(ms, tz).asUtc - Math.floor(ms / 1000) * 1000;
  let at = target - offsetAt(target);
  at = target - offsetAt(at);
  return at;
}

/**
 * The instant a calendar day (month 1-12) starts in `zone`: midnight there. A
 * day whose midnight does not exist (clocks jump at 00:00) starts at its first
 * minute; a midnight that happens twice starts at the first one.
 */
export function startOfZonedDay(year: number, month: number, day: number, zone: string): number {
  const tz = safeTimeZone(zone);
  const target = Date.UTC(year, month - 1, day);
  const dateAt = (ms: number) => {
    const wall = wallClock(ms, tz);
    return Date.UTC(wall.year, wall.month - 1, wall.day);
  };
  let start = zonedInstant(year, month, day, 0, 0, tz);
  // Midnight skipped by a clock change: step forward to the first real minute of the day.
  for (let step = 0; step < 3 && dateAt(start) < target; step++) start += HOUR_MS;
  // Midnight that happens twice: the day starts at the first one.
  for (let step = 0; step < 3 && dateAt(start - 1) === target; step++) start -= HOUR_MS;
  return start;
}

/** [from, toExclusive) of a whole calendar day in the shop's zone. */
export function dayWindow(key: string, zone: string): { from: number; toExclusive: number } {
  const parts = parseDayKey(key);
  if (!parts) throw new Error(`Not a day: ${key}`);
  const next = parseDayKey(addDaysToKey(key, 1))!;
  return {
    from: startOfZonedDay(parts.year, parts.month, parts.day, zone),
    toExclusive: startOfZonedDay(next.year, next.month, next.day, zone),
  };
}

/** "09:30" on the shop's wall at an instant: what an `<input type="time">` holds. */
export function wallTimeValue(ms: number, zone: string): string {
  const { hour, minute } = wallClock(ms, zone);
  return `${pad(hour)}:${pad(minute)}`;
}

/** "2026-10-04T09:30" on the shop's wall: what an `<input type="datetime-local">` holds. */
export function wallDateTimeValue(ms: number, zone: string): string {
  return `${dayKeyIn(ms, zone)}T${wallTimeValue(ms, zone)}`;
}

/**
 * A wall reading typed into a form ("2026-10-04T09:30", or the date and the
 * time apart) read as the shop's clock, never the server's. null when it is
 * not a real date and time.
 */
export function parseWallDateTime(value: string | null | undefined, zone: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const day = parseDayKey(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!day || hour > 23 || minute > 59) return null;
  return zonedInstant(day.year, day.month, day.day, hour, minute, zone);
}

/** "9 AM" on the hour, "9:30 AM" otherwise. */
export function clockLabel(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve} ${suffix}` : `${twelve}:${pad(minute)} ${suffix}`;
}

/** "9 AM" / "9:30 AM" on the shop's wall at an instant. */
export function timeLabelIn(ms: number, zone: string): string {
  const { hour, minute } = wallClock(ms, zone);
  return clockLabel(hour, minute);
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** `Intl` formatting in the shop's zone, with the formatter cached per zone and options. */
export function formatIn(ms: number, zone: string, options: Intl.DateTimeFormatOptions): string {
  const tz = safeTimeZone(zone);
  const key = `${tz}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz });
    formats.set(key, format);
  }
  return format.format(new Date(ms));
}

/** A day key in words, e.g. `{ month: "short", day: "numeric" }` gives "Oct 4". No zone needed: a key is already a calendar day. */
export function dayKeyLabel(key: string, options: Intl.DateTimeFormatOptions): string {
  const parts = parseDayKey(key);
  if (!parts) return key;
  return formatIn(Date.UTC(parts.year, parts.month - 1, parts.day, 12), "UTC", options);
}

/** "Sunday, October 4" for a day key. */
export function longDayLabel(key: string): string {
  return dayKeyLabel(key, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * A Date whose LOCAL fields read the shop's wall clock at `ms`. For code that
 * does calendar sums with date-fns on wall readings (the booking dialog's
 * "Today" and "Tomorrow"), so it agrees with the shop and not with the device.
 * Never store it or send it anywhere as an instant.
 */
export function wallDate(ms: number, zone: string): Date {
  const wall = wallClock(ms, zone);
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}
