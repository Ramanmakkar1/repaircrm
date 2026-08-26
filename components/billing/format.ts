/**
 * Date formatting for billing documents.
 *
 * Everything renders in a fixed en-US style so a printed invoice looks the same
 * on every machine, and so server-rendered markup matches what the client
 * hydrates (a locale-sensitive formatter would not).
 */

const SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const WITH_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "Aug 26, 2026" — or an em dash when the date is missing. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : SHORT.format(d);
}

/** "August 26, 2026" — used on print views where there is room. */
export function formatDateLong(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : LONG.format(d);
}

/** "Aug 26, 2026, 4:15 PM" — payment timestamps. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : WITH_TIME.format(d);
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
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when a due date has passed and the document still owes money. */
export function isOverdue(
  dueDate: Date | null | undefined,
  balanceCents: number
): boolean {
  if (!dueDate || balanceCents <= 0) return false;
  return dueDate.getTime() < Date.now();
}
