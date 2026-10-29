/**
 * The order the Repairs list opens in: most urgent first.
 *
 * Pure (no db, no next/*), so the page, the toolbar and the tests share it.
 *
 *   1. Work on the bench before work on the shelf: Ready for pickup goes last,
 *      because nothing more is done to it until the customer comes in.
 *   2. Overdue first, then due soonest (a promised date in the past sorts
 *      before one in the future, so "overdue then due soonest" is one ascending
 *      sort on the due date).
 *   3. No due date: highest priority first.
 *   4. Ties: the newest check-in first, the order the list used to have.
 */

import { asPriority, isReadyForPickup, PRIORITIES } from "./ticket-meta";

/** The `?sort=` value the list uses when none is given. Left out of URLs. */
export const DEFAULT_TICKET_SORT = "urgent";

export const TICKET_SORTS = [
  { value: "urgent", label: "Most urgent first" },
  { value: "created", label: "Newest first" },
  { value: "due", label: "Due soonest" },
] as const;

/** How many repairs the urgency sort orders in memory; a shop with more open work than this is sorted by the newest this many. */
export const URGENCY_SORT_CAP = 2000;

export type UrgencyRow = {
  id: string;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  createdAt: Date;
};

const priorityRank = (priority: string | null) => PRIORITIES.indexOf(asPriority(priority));

export function compareUrgency(a: UrgencyRow, b: UrgencyRow): number {
  const shelfA = isReadyForPickup(a.status) ? 1 : 0;
  const shelfB = isReadyForPickup(b.status) ? 1 : 0;
  if (shelfA !== shelfB) return shelfA - shelfB;

  const dueA = a.dueDate?.getTime() ?? null;
  const dueB = b.dueDate?.getTime() ?? null;
  if (dueA !== null && dueB !== null && dueA !== dueB) return dueA - dueB;
  if (dueA === null && dueB !== null) return 1;
  if (dueA !== null && dueB === null) return -1;

  const rank = priorityRank(b.priority) - priorityRank(a.priority);
  if (rank !== 0) return rank;

  return b.createdAt.getTime() - a.createdAt.getTime();
}

/** A sorted copy; the input is left alone. */
export function sortByUrgency<T extends UrgencyRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareUrgency);
}
