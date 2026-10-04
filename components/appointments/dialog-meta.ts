/**
 * Whether the Easy-mode booking opens with its "More options" showing.
 *
 * Pure (no React, no `next/*`) so the rule can be tested without opening a
 * dialog. The "What for" step keeps the title, the linked repair, the
 * technician, the place and the notes behind one "More options" button, with
 * two exceptions:
 *
 *  - Full mode always shows everything, as it always has.
 *  - EDITING a booking that already carries a ticket, a tech, a place, notes or
 *    a length other than the default opens the options, so you can see what you
 *    are about to change. A NEW booking never does: a branch pre-selected as the
 *    location is a default, not something you typed.
 */

/** The "no choice" value the dialog's selects use. */
export const NONE = "none";

/** The default booking length, in minutes, as the duration select spells it. */
export const DEFAULT_DURATION = "60";

export function startsWithMoreDetails(
  values: {
    id: string | null;
    ticketId: string;
    assignedToId: string;
    locationId: string;
    duration: string;
    notes: string;
  },
  simple: boolean,
): boolean {
  if (!simple) return true;
  if (!values.id) return false;
  return (
    values.ticketId !== NONE ||
    values.assignedToId !== NONE ||
    values.locationId !== NONE ||
    values.duration !== DEFAULT_DURATION ||
    values.notes.trim() !== ""
  );
}
