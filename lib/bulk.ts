/**
 * The guard every bulk endpoint runs before it touches a row.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------
 * A bulk action is the easiest place in this application to do catastrophic
 * damage, and there are three separate ways to do it:
 *
 *   1. `updateMany({ where: { id: { in: ids } } })` with no `shopId` rewrites
 *      another tenant's records. That one is not solved here — it is solved by
 *      every caller putting `shopId` from the SESSION in the same `where` — but
 *      it is the reason the rest of this exists.
 *   2. An `updateMany` whose `where` collapses to nothing rewrites the entire
 *      shop. `deleteCannedResponseAction` was already bitten by a possibly
 *      `undefined` id reaching a `deleteMany`; an id ARRAY has the same failure
 *      mode with a hundred times the blast radius, so an empty list is refused
 *      here rather than being allowed to become "match everything".
 *   3. A list nobody bounded is a denial of service with a friendly UI on it.
 *
 * Three screens need all three checks, and three copies of a security check is
 * three chances for one of them to drift. Hence one function, and a test that
 * points at it directly.
 *
 * Deliberately NOT a "use server" module: those may only export async
 * functions, so the shared result type could not ship from an actions file.
 */

/**
 * The most rows one call may touch.
 *
 * Sized against the list screens rather than the database: tickets and invoices
 * page at 25 and leads at 100, so nothing a person can actually select comes
 * near this. It is a ceiling on a forged request, not a workflow limit.
 */
export const BULK_LIMIT = 100;

/**
 * A lower ceiling for anything that leaves the building.
 *
 * Emailing is not undoable and every message costs the shop's sending
 * reputation, so a bulk send is capped at one screenful.
 */
export const BULK_SEND_LIMIT = 25;

/** cuid()s are 25 characters. The cap only has to stop something absurd. */
const MAX_ID_LENGTH = 64;

/** What every bulk action hands back: a count the UI can put in a sentence. */
export type BulkResult =
  | { ok: true; count: number; message: string }
  | { ok: false; error: string };

export type BulkIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Validates the id list that arrived over the wire.
 *
 * Returns a de-duplicated array, or a refusal. It says nothing about ownership
 * — that is the caller's `shopId` filter, and no amount of id validation
 * substitutes for it.
 */
export function bulkIds(input: unknown, limit: number = BULK_LIMIT): BulkIdsResult {
  if (!Array.isArray(input)) return { ok: false, error: "Nothing was selected." };

  // Checked on the RAW length: a caller that posts ten thousand duplicates of
  // one id has still asked us to do something unreasonable.
  if (input.length > limit) {
    return { ok: false, error: `Select at most ${limit} at a time.` };
  }

  const ids = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || id.length > MAX_ID_LENGTH) continue;
    ids.add(id);
  }

  if (ids.size === 0) return { ok: false, error: "Nothing was selected." };

  return { ok: true, ids: [...ids] };
}

/** "1 ticket", "9 tickets". Naive plural, same rule as the action bar's. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
