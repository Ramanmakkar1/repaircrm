/**
 * Shared return shape for the ticket server actions.
 *
 * This lives outside `actions.ts` on purpose: a `"use server"` module may only
 * export async functions, so the type and its initial value can't ship from
 * there — Next fails the build with `invalid-use-server-value`.
 */
export type ActionState = { error?: string; ok?: boolean };

/** Initial value for `useActionState`. */
export const EMPTY_STATE: ActionState = {};
