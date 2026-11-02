/**
 * Plain-words formatting for the operator console. The person reading it runs
 * the business, not the servers: "12 MB", "3 days ago", "$1,240".
 *
 * Pure — no database, no request — so the tests can pin every wording.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sizes in KB / MB / GB (1 KB = 1024 bytes, the same as the app's "10 MB" upload limit). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes === 0) return "0 KB";
  if (bytes < 1024) return "< 1 KB";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unknown";
  return new Intl.NumberFormat("en-US").format(value);
}

/** Whole currency units for big totals; an unknown currency code still prints. */
export function formatMoney(cents: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cents / 100)} ${code}`;
  }
}

/** "Oct 4, 2026" (UTC, so every operator sees the same day). */
export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

/** "Oct 4, 2026, 6:05 PM UTC" — for tooltips next to a relative time. */
export function formatDateTime(value: Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago"; null is "Never". */
export function timeAgo(value: Date | null | undefined, now: Date): string {
  if (!value) return "Never";
  const elapsed = now.getTime() - value.getTime();
  // A clock a little ahead of ours is still "just now", never "in 2 minutes".
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${plural(Math.floor(days / 365), "year")} ago`;
}

/** "in 3 days" / "today" / "3 days ago", for a scheduled date such as a deletion. */
export function daysFromNow(value: Date, now: Date): string {
  const days = Math.round((value.getTime() - now.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days > 0) return `in ${plural(days, "day")}`;
  return `${plural(-days, "day")} ago`;
}

/** Share of a total as a whole percent for a bar; anything above zero shows at least 1%. */
export function percentOf(part: number, total: number): number {
  if (!(total > 0) || !(part > 0)) return 0;
  return Math.min(100, Math.max(1, Math.round((part / total) * 100)));
}
