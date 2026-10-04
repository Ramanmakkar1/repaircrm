/**
 * Date formatting for billing documents.
 *
 * Everything renders in a fixed en-US style so a printed invoice looks the same
 * on every machine, and so server-rendered markup matches what the client
 * hydrates (a locale-sensitive formatter would not).
 *
 * TIME ZONES. With no zone a value is read in UTC, which is right for a stored
 * CALENDAR DAY (a due date or an expiry is that day at UTC midnight). An
 * INSTANT (when an invoice was raised, when a payment was taken) passes the
 * shop's zone (`Shop.timezone`) so a 9pm sale reads the shop's day, whatever
 * zone the server runs in. See components/billing/shop-clock.ts.
 */


/** A zone Intl accepts, else UTC: a bad value saved on the shop must not break a page. */
function safeTimeZone(zone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

const SHORT_OPTIONS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const LONG_OPTIONS: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
const WITH_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const formats = new Map<string, Intl.DateTimeFormat>();

/** One formatter per style and zone, made once. No zone is UTC (a calendar day). */
function formatter(style: "short" | "long" | "time", zone?: string | null): Intl.DateTimeFormat {
  // Cached by the zone as given, so a list of a hundred dates checks it once.
  const key = `${style}|${zone || "UTC"}`;
  let format = formats.get(key);
  if (!format) {
    const options = style === "short" ? SHORT_OPTIONS : style === "long" ? LONG_OPTIONS : WITH_TIME_OPTIONS;
    format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone ? safeTimeZone(zone) : "UTC" });
    formats.set(key, format);
  }
  return format;
}

function readDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Aug 26, 2026" — or an em dash when the date is missing. Pass the shop's
 * zone for an instant; leave it out for a stored calendar day.
 */
export function formatDate(value: Date | string | null | undefined, zone?: string | null): string {
  const d = readDate(value);
  return d ? formatter("short", zone).format(d) : "—";
}

/** "August 26, 2026" — used on print views where there is room. */
export function formatDateLong(value: Date | string | null | undefined, zone?: string | null): string {
  const d = readDate(value);
  return d ? formatter("long", zone).format(d) : "—";
}

/** "Aug 26, 2026, 4:15 PM" — payment timestamps. Pass the shop's zone. */
export function formatDateTime(value: Date | string | null | undefined, zone?: string | null): string {
  const d = readDate(value);
  return d ? formatter("time", zone).format(d) : "—";
}

/** `2026-08-26`, for `<input type="date">` round-tripping. */
export function toDateInputValue(
  value: Date | string | null | undefined
): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Reads a `<input type="date">` value into a Date at UTC midnight.
 * Storing the bare calendar day (rather than local midnight) keeps a due date
 * from drifting a day when it is read back in another timezone.
 */
export function fromDateInputValue(
  value: FormDataEntryValue | null | undefined
): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : d;
}

/**
 * True when a due date has passed and the document still owes money.
 *
 * `now` is the shop's wall clock (lib/shop-time.ts `shopNow`) on the server, so
 * the due day starts at the shop's midnight rather than UTC's. It defaults to
 * the plain clock for callers that have no shop zone to hand.
 */
export function isOverdue(
  dueDate: Date | null | undefined,
  balanceCents: number,
  now: number = Date.now(),
): boolean {
  if (!dueDate || balanceCents <= 0) return false;
  return dueDate.getTime() < now;
}
