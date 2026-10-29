/**
 * Account deletion: the shared vocabulary.
 *
 * Pure (no db, no next/*), so the public page, the in-app page, the job and the
 * tests can all import it.
 *
 * TWO DIFFERENT THINGS GET DELETED
 * --------------------------------
 *   A login     Any staff member can delete their own login. It happens at
 *               once. The user row is ANONYMISED, not removed: tickets,
 *               comments, payments, time entries, drawer counts and the audit
 *               trail point at it, and several of those relations CASCADE
 *               (TimeEntry, TimeClockEntry, CashDrawerSession.openedBy), so a
 *               hard delete would silently erase the shop's payroll and cash
 *               records. See lib/account-deletion/user.ts.
 *   A shop      Only an owner. Scheduled: every login and API key is switched
 *               off at once, and the purge job hard-deletes every row and file
 *               of the shop after the grace period. See shop.ts and purge.ts.
 */

/** Seven days, unless ACCOUNT_DELETION_GRACE_HOURS says otherwise. */
export const DEFAULT_GRACE_HOURS = 7 * 24;

/**
 * The grace period, read when a deletion is REQUESTED and stored on the shop as
 * `deletionPurgeAfter`. Reading it at request time means the date the owner was
 * told is the date that holds: changing the env later does not shorten a
 * window somebody was already promised.
 *
 * `ACCOUNT_DELETION_GRACE_HOURS=0` makes a request due at once. That is the test
 * hook for exercising the purge end to end; do not set it in production.
 */
export function graceHours(): number {
  const raw = process.env.ACCOUNT_DELETION_GRACE_HOURS?.trim();
  if (!raw) return DEFAULT_GRACE_HOURS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_GRACE_HOURS;
  return Math.min(value, 90 * 24);
}

export function purgeAfterFrom(requestedAt: Date, hours = graceHours()): Date {
  return new Date(requestedAt.getTime() + hours * 60 * 60 * 1000);
}

/** The placeholder a deleted person's row keeps. Shown wherever their name was. */
export const DELETED_USER_NAME = "Deleted user";

/**
 * A unique, undeliverable address for the anonymised row. `.invalid` is
 * reserved (RFC 2606), so nothing can ever be sent to it, and the person's real
 * address is free to sign up again.
 */
export function deletedUserEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

/** A cuid-shaped id. The purge refuses anything else before it touches a table. */
export function isSafeShopId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export const SUPPORT_EMAIL = "support@repairshelper.com";

/** "Tuesday, November 4, 2026" — the date the purge may run, in words. */
export function deletionDateLabel(date: Date, timeZone = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** What the server actions hand back. Refusals are data, never throws. */
export type DeletionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string };

/** Case- and space-insensitive comparison for "type the shop name". */
export function shopNameMatches(typed: string, shopName: string): boolean {
  const norm = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed).length > 0 && norm(typed) === norm(shopName);
}
