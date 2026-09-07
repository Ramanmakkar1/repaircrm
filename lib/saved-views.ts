/**
 * Saved views: a named query string on a list screen.
 *
 * ---------------------------------------------------------------------------
 * THIS MODULE HAS NO SERVER IMPORTS, DELIBERATELY
 * ---------------------------------------------------------------------------
 * The types and helpers here are used on BOTH sides of the client boundary —
 * the page builds tabs with them on the server, and the save dialog normalises
 * the current query with them in the browser. Importing `db` or `requireUser`
 * here (as this file briefly did) drags `next/headers` into the client bundle
 * through the dialog, and the whole route fails to compile with an import
 * trace that names five files and blames none of them.
 *
 * The query that needs a session lives in `lib/saved-views-query.ts`, which
 * only the server ever imports.
 *
 * The built-in tabs are the same five for everybody. A queue is not — "my open
 * jobs", "waiting on parts more than three days", "unpaid over $500" are the
 * filters a particular person actually works from, and re-typing them every
 * morning is the sort of small tax that makes a tool feel like a website.
 *
 * The whole feature is: store the search params, give them a name, render them
 * as extra tabs. There is no new filtering engine, because a view can only
 * ever express what the screen's own filters already express.
 */

export interface SavedViewItem {
  id: string;
  name: string;
  /** Search params without the leading "?". */
  query: string;
}

/**
 * How many views one person may keep per screen.
 *
 * Not a storage concern — it is the tab strip. Past about a dozen the saved
 * views are wider than the list they filter and finding one costs more than
 * re-typing the filter, which is the opposite of the point.
 */
export const SAVED_VIEW_LIMIT = 12;

export const SAVED_VIEW_NAME_MAX = 40;

/**
 * The paths that may own a saved view.
 *
 * A closed list, checked on write, so the `path` column cannot be turned into
 * a place to stash arbitrary strings against a user by anyone who can call the
 * action. Adding a screen means adding a line here — cheap, and the check is
 * the point.
 */
export const SAVED_VIEW_PATHS = ["/tickets", "/invoices", "/leads"] as const;
export type SavedViewPath = (typeof SAVED_VIEW_PATHS)[number];

export function isSavedViewPath(value: string): value is SavedViewPath {
  return (SAVED_VIEW_PATHS as readonly string[]).includes(value);
}

/**
 * Normalise a query string before it is stored or compared.
 *
 * Sorted, and stripped of the params that are position rather than filter —
 * otherwise "Overdue jobs" saved from page 3 would always reopen on page 3,
 * and the same filter arrived at from two directions would fail to match the
 * view that already describes it.
 */
const NOT_A_FILTER = new Set(["page", "cursor", "view"]);

export function normalizeViewQuery(raw: string): string {
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const kept = [...params.entries()]
    .filter(([key, value]) => !NOT_A_FILTER.has(key) && value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(kept).toString();
}

/** The href a saved view's tab points at. */
export function savedViewHref(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}
