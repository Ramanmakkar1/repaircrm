/**
 * Reporting period maths.
 *
 * Pure: imported by the server page, the query loader and the client-free
 * period pills, so no `db`, no `next/*`, no "use server".
 *
 * Everything is anchored to UTC calendar days, matching components/statements/
 * period.ts — a report headed "August" must cover exactly that month no matter
 * which side of midnight the browser happens to be on.
 *
 * A period also carries its own *buckets*: the pre-computed x-axis of every
 * chart on the page. Deriving them once here (rather than in each chart) is
 * what keeps "Revenue by week" and "Tickets by week" on the same columns.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const REPORT_PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-90", label: "Last 90 days" },
  { key: "this-year", label: "This year" },
] as const;

export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]["key"] | "custom";

export const DEFAULT_PERIOD: ReportPeriodKey = "this-month";

/** The key a hand-picked from/to range travels under. */
export const CUSTOM_PERIOD = "custom";

/** Everything the URL carries about which slice of time is on screen. */
export type ReportRangeParams = {
  period?: string | string[] | null;
  from?: string | string[] | null;
  to?: string | string[] | null;
};

export type Bucket = {
  /** Short axis tick, e.g. "Aug 4" or "Aug". */
  label: string;
  /** Spoken/table form, e.g. "Aug 4 – Aug 10" or "August 2026". */
  fullLabel: string;
  from: Date;
  toExclusive: Date;
};

export type ReportPeriod = {
  key: ReportPeriodKey;
  label: string;
  /** `yyyy-mm-dd`, for the date inputs and the CSV export links. */
  fromValue: string;
  /** `yyyy-mm-dd`, INCLUSIVE — the last day the report covers. */
  toValue: string;
  /** Inclusive start, UTC midnight. */
  from: Date;
  /** Exclusive end — never later than the start of tomorrow. */
  toExclusive: Date;
  /** e.g. "Aug 1 – Aug 27, 2026" — printed under the page title. */
  rangeLabel: string;
  /** How the columns are cut. Long periods get months, short ones weeks. */
  grain: "week" | "month";
  buckets: Bucket[];
};

const dayMonth = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const monthShort = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
});
const monthYear = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const dayMonthYear = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utc(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day));
}

/** A single `yyyy-mm-dd` search param, or null when it is absent or malformed. */
function parseDayParam(raw: string | string[] | null | undefined): Date | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `?period=` (or `?period=custom&from=&to=`) -> a resolved range.
 *
 * Anything unrecognised falls back to this month, and a custom range missing
 * either end does the same rather than reporting on half a window. `to` is
 * INCLUSIVE to the operator — they typed a day they want counted — and
 * exclusive to the queries, which is the conversion this function owns.
 */
export function resolveReportPeriod(
  params: ReportRangeParams | string | null | undefined,
  now: Date = new Date(),
): ReportPeriod {
  const input: ReportRangeParams =
    typeof params === "string" || params == null ? { period: params } : params;
  const raw = Array.isArray(input.period) ? input.period[0] : input.period;

  const today = startOfUtcDay(now);
  // Nothing can be recorded in the future, so no period ever runs past tonight.
  // Without this, "This year" would render four empty columns every August.
  const tomorrow = new Date(today.getTime() + DAY_MS);

  if (raw === CUSTOM_PERIOD) {
    const customFrom = parseDayParam(input.from);
    const customTo = parseDayParam(input.to);
    if (customFrom && customTo) {
      // A reversed pair is swapped rather than refused — the intent is obvious.
      const [start, end] =
        customFrom.getTime() <= customTo.getTime()
          ? [customFrom, customTo]
          : [customTo, customFrom];
      return buildPeriod(CUSTOM_PERIOD, "Custom range", start, new Date(end.getTime() + DAY_MS));
    }
  }

  const key = REPORT_PERIODS.find((p) => p.key === raw)?.key ?? DEFAULT_PERIOD;
  const label = REPORT_PERIODS.find((p) => p.key === key)!.label;

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  let from: Date;
  let toExclusive: Date;

  switch (key) {
    case "last-month":
      from = utc(year, month - 1, 1);
      toExclusive = utc(year, month, 1);
      break;
    case "last-90":
      from = new Date(today.getTime() - 89 * DAY_MS);
      toExclusive = tomorrow;
      break;
    case "this-year":
      from = utc(year, 0, 1);
      toExclusive = tomorrow;
      break;
    case "this-month":
    default:
      from = utc(year, month, 1);
      toExclusive = tomorrow;
      break;
  }

  return buildPeriod(key, label, from, toExclusive);
}

/** The shared tail of every branch above: grain, buckets and the printed label. */
function buildPeriod(
  key: ReportPeriodKey,
  label: string,
  from: Date,
  toExclusive: Date,
): ReportPeriod {
  const grain: "week" | "month" =
    toExclusive.getTime() - from.getTime() > 100 * DAY_MS ? "month" : "week";
  const lastDay = new Date(toExclusive.getTime() - DAY_MS);

  return {
    key,
    label,
    fromValue: dayValue(from),
    toValue: dayValue(lastDay),
    from,
    toExclusive,
    rangeLabel: `${dayMonth.format(from)} – ${dayMonthYear.format(lastDay)}`,
    grain,
    buckets:
      grain === "month" ? monthBuckets(from, toExclusive) : weekBuckets(from, toExclusive),
  };
}

/** Seven-day chunks from the period start, the last one clipped to the end. */
function weekBuckets(from: Date, toExclusive: Date): Bucket[] {
  const buckets: Bucket[] = [];
  for (
    let start = from.getTime();
    start < toExclusive.getTime();
    start += WEEK_MS
  ) {
    const end = Math.min(start + WEEK_MS, toExclusive.getTime());
    const startDate = new Date(start);
    const lastDay = new Date(end - DAY_MS);
    buckets.push({
      label: dayMonth.format(startDate),
      fullLabel:
        start === end - DAY_MS
          ? dayMonth.format(startDate)
          : `${dayMonth.format(startDate)} – ${dayMonth.format(lastDay)}`,
      from: startDate,
      toExclusive: new Date(end),
    });
  }
  return buckets;
}

/** Calendar months, the last one clipped to the end of the period. */
function monthBuckets(from: Date, toExclusive: Date): Bucket[] {
  const buckets: Bucket[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  while (utc(year, month).getTime() < toExclusive.getTime()) {
    const start = buckets.length === 0 ? from : utc(year, month);
    const end = new Date(
      Math.min(utc(year, month + 1).getTime(), toExclusive.getTime()),
    );
    buckets.push({
      label: monthShort.format(start),
      fullLabel: monthYear.format(start),
      from: start,
      toExclusive: end,
    });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return buckets;
}

/**
 * Which column a timestamp belongs to, or -1 when it is outside the period.
 * Linear because a period never has more than ~13 buckets.
 */
export function bucketIndex(buckets: readonly Bucket[], at: Date): number {
  const time = at.getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (time >= buckets[i].from.getTime() && time < buckets[i].toExclusive.getTime()) {
      return i;
    }
  }
  return -1;
}

/** "3h 15m" / "2d 4h" / "45m" — used for time-to-resolve and logged hours. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

/**
 * Logged time for the leaderboard, from summed TimeEntry.seconds.
 *
 * Under an hour it reads in minutes: a two-minute timer rendered as "0.0h"
 * looks like a broken row rather than a short job.
 */
export function formatHours(seconds: number): string {
  if (seconds <= 0) return "0h";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
