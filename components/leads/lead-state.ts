/**
 * Return shapes for the lead server actions.
 *
 * These live outside `actions.ts` on purpose: a `"use server"` module may only
 * export async functions, so a type (or an initial-state constant) cannot ship
 * from there — Next fails the build with `invalid-use-server-value`.
 */

/** `useActionState` shape for the full-page / dialog lead form. */
export type LeadFormState =
  | { error?: string; fieldErrors?: Record<string, string>; ok?: boolean }
  | undefined;

export const EMPTY_LEAD_STATE: LeadFormState = undefined;

/** Result for the small awaited actions (contact, close, reopen). */
export type LeadActionResult = { ok: true } | { ok: false; error: string };

/** Result for the conversion flow — carries the rows it created. */
export type ConvertResult =
  | { ok: true; customerId: string; ticketId: string | null }
  | { ok: false; error: string };

/** A customer that looks like it might already BE this lead. */
export type LeadMatch = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Why we think it's a match — shown so staff can judge it themselves. */
  on: "email" | "phone";
};
