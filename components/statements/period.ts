/**
 * Statement period maths.
 *
 * Pure: imported by the staff page, the print page and the client period
 * picker, so no `db`, no `next/*`, no "use server".
 *
 * Everything is anchored to UTC calendar days, matching how the rest of the
 * billing module stores dates (see components/billing/format.ts) — a statement
 * headed "Jun 1 – Aug 30" must cover exactly those days no matter which side of
 * midnight the browser is on.
 */

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
  /** Inclusive first day, at UTC midnight. */
  from: Date;
  /** Inclusive last day, at UTC midnight. */
  to: Date;
  /** Exclusive upper bound for `createdAt < toExclusive` queries. */
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
  return Number.isNaN(date.getTime()) ? null : date;
}

function toValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves `?from=&to=` into a usable range, defaulting to the last 90 days.
 *
 * A reversed range (`from` after `to`) is swapped rather than rejected — the
 * operator's intent is obvious and an error page would be theatre.
 */
export function resolvePeriod(
  fromRaw?: unknown,
  toRaw?: unknown,
  now: Date = new Date(),
): Period {
  const today = startOfUtcDay(now);

  let to = parseDay(toRaw) ?? today;
  let from =
    parseDay(fromRaw) ?? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);

  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const spansToToday = to.getTime() === today.getTime();
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  const preset = PERIOD_PRESETS.find((p) => p.days === days);

  return {
    from,
    to,
    toExclusive: new Date(to.getTime() + DAY_MS),
    fromValue: toValue(from),
    toValue: toValue(to),
    presetDays: spansToToday && preset ? preset.days : null,
  };
}

/** `yyyy-mm-dd` bounds for a preset ending today — what the pills navigate to. */
export function presetRange(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = startOfUtcDay(now);
  return {
    from: toValue(new Date(today.getTime() - days * DAY_MS)),
    to: toValue(today),
  };
}
