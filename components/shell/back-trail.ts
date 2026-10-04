import { isAppScreen, isEntryForm, workspaceBack } from "@/lib/touch-workspace";

/**
 * Back that means "where I just was".
 *
 * The shell keeps a short trail of the screens visited in this tab (address
 * plus its filters), so Back from a repair returns to the filtered list or the
 * Pickup counter it was opened from, Back from a customer's repair returns to
 * that customer, and so on. With no earlier screen (a bookmark, a link from an
 * email, a fresh tab) Back falls back to the screen above this one
 * (workspaceBack in lib/touch-workspace.ts).
 *
 * The rules, kept pure so they can be tested on their own:
 *   - A screen is its address; a new filter on the same screen replaces its
 *     entry, so Back leaves the list instead of undoing one filter at a time.
 *   - Arriving at a screen already on the trail (Back, the browser's back, or
 *     a link to an earlier screen) cuts the trail there, so Back never
 *     ping-pongs between a list and a record.
 *   - Back skips entry forms (new / edit) unless you are in one: after saving
 *     a new repair, Back goes to where you started, not to an empty form.
 */

const MAX = 30;

export function pathOf(href: string): string {
  return href.split(/[?#]/)[0] || "/";
}

/** The trail after arriving at `href`. */
export function visit(trail: readonly string[], href: string): string[] {
  const path = pathOf(href);
  const at = trail.findIndex((entry) => pathOf(entry) === path);
  if (at >= 0) return [...trail.slice(0, at), href];
  return [...trail, href].slice(-MAX);
}

/** Where Back goes from `currentPath`, given the trail so far. */
export function backTarget(trail: readonly string[], currentPath: string): string {
  const current = pathOf(currentPath);
  // The trail's top is normally the current screen; while a screen change is
  // still being recorded it is the screen before. Either way, look before it.
  const index = trail.findIndex((entry) => pathOf(entry) === current);
  const end = index >= 0 ? index : trail.length;
  const inForm = isEntryForm(current);
  for (let i = end - 1; i >= 0; i -= 1) {
    const entry = trail[i];
    const path = pathOf(entry);
    if (path === current || !isAppScreen(path)) continue;
    if (!inForm && isEntryForm(path)) continue;
    return entry;
  }
  return workspaceBack(current);
}

/* -------------------------------------------------------------------------- */
/* Per-tab store                                                               */
/* -------------------------------------------------------------------------- */

const KEY = "rf_trail";
let memory: string[] | null = null;
const listeners = new Set<() => void>();

/** The trail for this tab. Session storage, so it survives a reload but not a new tab. */
export function readTrail(): string[] {
  if (memory) return memory;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.startsWith("/")).slice(-MAX) : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function recordVisit(href: string): void {
  const before = readTrail();
  const next = visit(before, href);
  if (next.length === before.length && next.every((entry, index) => entry === before[index])) return;
  memory = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the trail still works for this page's life.
  }
  for (const listener of listeners) listener();
}

export function subscribeTrail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
