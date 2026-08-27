/**
 * Return shapes for the appointment server actions.
 *
 * Outside `actions.ts` on purpose: a `"use server"` module may only export
 * async functions, so types and constants cannot ship from there.
 */

/** The booking we would be double-booking a tech into. */
export type AppointmentConflict = {
  id: string;
  title: string;
  /** Pre-formatted for display — the client never re-parses a timestamp. */
  when: string;
  techName: string;
  customerName: string | null;
};

/**
 * `conflict` is a WARNING, not a rejection: shops double-book on purpose all the
 * time (a 10-minute pickup during a 2-hour bench job). The action refuses once,
 * hands back what it would collide with, and goes through on the retry with
 * `confirmOverlap`.
 */
export type AppointmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; conflict?: undefined }
  | { ok: false; error: string; conflict: AppointmentConflict };

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** Options for the customer / ticket / tech / location pickers. */
export type Option = { value: string; label: string };
