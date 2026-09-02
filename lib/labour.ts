/**
 * Turning logged time into money.
 *
 * A shop bills the bench at an hourly rate, rounded up to a billing increment —
 * fifteen minutes almost everywhere, because nobody invoices "0h 03m of
 * diagnostics". Both live merge-safe in `Shop.settings` alongside the workflow
 * lists (see app/(app)/settings/actions.ts mergeSettings).
 *
 * Pure: imported by the timer card, the invoice banner and the server actions
 * behind both, so no `db`, no `next/*`, no "use server".
 */

/** What the seed ships and what a brand-new shop bills at: $95/hour. */
export const DEFAULT_LABOUR_RATE_CENTS = 9500;

/** Quarter-hour billing, the trade standard. */
export const DEFAULT_ROUNDING_MINUTES = 15;

export type LabourSettings = {
  rateCents: number;
  roundingMinutes: number;
};

export const DEFAULT_LABOUR: LabourSettings = {
  rateCents: DEFAULT_LABOUR_RATE_CENTS,
  roundingMinutes: DEFAULT_ROUNDING_MINUTES,
};

/**
 * Reads the labour block out of the loosely-typed `Shop.settings` JSON.
 * `defaultLabourRateCents` is the key the seed already writes, so an existing
 * shop keeps its rate without a migration.
 */
export function readLabourSettings(settings: unknown): LabourSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...DEFAULT_LABOUR };
  }
  const blob = settings as Record<string, unknown>;
  return {
    rateCents: positiveInt(
      blob.defaultLabourRateCents,
      DEFAULT_LABOUR_RATE_CENTS,
    ),
    roundingMinutes: Math.max(
      1,
      positiveInt(blob.labourRoundingMinutes, DEFAULT_ROUNDING_MINUTES),
    ),
  };
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

/**
 * Rounds a duration UP to the next whole increment. Always up: a shop that
 * rounds a 16-minute job down to 15 is giving work away, and one that rounds
 * 14 minutes down to nothing is billing zero for a job it did.
 */
export function roundSecondsUp(
  seconds: number,
  roundingMinutes: number,
): number {
  const step = Math.max(1, Math.round(roundingMinutes)) * 60;
  const value = Math.max(0, Math.round(seconds));
  if (value === 0) return 0;
  return Math.ceil(value / step) * step;
}

/** What a rounded stretch of bench time is worth, in cents. */
export function labourAmountCents(
  seconds: number,
  { rateCents, roundingMinutes }: LabourSettings,
): number {
  const rounded = roundSecondsUp(seconds, roundingMinutes);
  return Math.round((rounded / 3600) * rateCents);
}

/** 5400 -> "1:30" — the h:mm every labour line and total is quoted in. */
export function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  // 59.6 minutes rounding to 60 would print "0:60".
  if (minutes === 60) return `${hours + 1}:00`;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * The description that lands on the invoice:
 *   "Labour — Maya Rodriguez, Aug 24 (1:30)"
 *
 * `dateLabel` is formatted by the caller, which is already holding the shop's
 * timezone-aware formatter.
 */
export function labourDescription(
  techName: string,
  dateLabel: string,
  seconds: number,
  roundingMinutes: number,
): string {
  const rounded = roundSecondsUp(seconds, roundingMinutes);
  return `Labour — ${techName}, ${dateLabel} (${formatHm(rounded)})`;
}
