/**
 * Statement period maths.
 *
 * Pure: imported by the staff page, the print page and the client period
 * picker, so no `db`, no `next/*`, no "use server".
 *
 * A period is a run of the SHOP's calendar days. `from` / `to` are those days
 * as dates at UTC midnight (how billing stores and prints a calendar day, see
 * components/billing/format.ts), and `startsAt` / `toExclusive` are the
 * instants the queries cut at: the shop's own midnights, in `Shop.timezone`.
 * So a statement headed "Jun 1 – Aug 30" covers exactly those days as the shop
 * lived them, and a payment taken at 9pm on Aug 30 is on it.
 */

import { shopDayRange, shopTodayKey } from "@/components/billing/shop-clock";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PERIOD_DAYS = 90;

/** One-click ranges above the date inputs. */
export const PERIOD_PRESETS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
] as const;

export type Period = {
  /** Inclusive first day, at UTC midnight (a calendar day, for display). */
  from: Date;
  /** Inclusive last day, at UTC midnight (a calendar day, for display). */
  to: Date;
  /** The instant the first day starts in the shop's zone: `createdAt >= startsAt`. */
  startsAt: Date;
  /** The instant the day after `to` starts in the shop's zone: `createdAt < toExclusive`. */
  toExclusive: Date;
  /** `yyyy-mm-dd` round-trip values for the date inputs and print links. */
  fromValue: string;
  toValue: string;
  /** The preset this range matches, or null for a hand-picked range. */
  presetDays: number | null;
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseDay(raw: unknown): Date | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function toValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today on the shop's calendar, as that day at UTC midnight. No zone is UTC's today. */
function todayFor(now: Date, zone?: string | null): Date {
  return zone ? new Date(`${shopTodayKey(now.getTime(), zone)}T00:00:00.000Z`) : startOfUtcDay(now);
}

/**
 * Resolves `?from=&to=` into a usable range, defaulting to the last 90 days.
 *
 * A reversed range (`from` after `to`) is swapped rather than rejected — the
 * operator's intent is obvious and an error page would be theatre.
 *
 * `zone` is the shop's (`Shop.timezone`): "today" and every day edge are the
 * shop's. Without it the days are UTC's, as they always were.
 */
export function resolvePeriod(
  fromRaw?: unknown,
  toRaw?: unknown,
  now: Date = new Date(),
  zone?: string | null,
): Period {
  const today = todayFor(now, zone);

  let to = parseDay(toRaw) ?? today;
  let from =
    parseDay(fromRaw) ?? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);

  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const spansToToday = to.getTime() === today.getTime();
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  const preset = PERIOD_PRESETS.find((p) => p.days === days);

  const edges = zone
    ? shopDayRange(toValue(from), toValue(to), zone)
    : { from, toExclusive: new Date(to.getTime() + DAY_MS) };

  return {
    from,
    to,
    startsAt: edges.from,
    toExclusive: edges.toExclusive,
    fromValue: toValue(from),
    toValue: toValue(to),
    presetDays: spansToToday && preset ? preset.days : null,
  };
}

/** `yyyy-mm-dd` bounds for a preset ending today — what the pills navigate to. */
export function presetRange(
  days: number,
  now: Date = new Date(),
  zone?: string | null,
): { from: string; to: string } {
  const today = todayFor(now, zone);
  return {
    from: toValue(new Date(today.getTime() - days * DAY_MS)),
    to: toValue(today),
  };
}
