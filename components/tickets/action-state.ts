/**
 * Shared return shape for the ticket server actions.
 *
 * This lives outside `actions.ts` on purpose: a `"use server"` module may only
 * export async functions, so the type and its initial value can't ship from
 * there — Next fails the build with `invalid-use-server-value`.
 */
export type ActionState = {
  error?: string;
  ok?: boolean;
  /**
   * The action DID its job, but something the person will assume happened
   * didn't — e.g. the ticket is marked ready, yet no message reached the
   * customer. Shown as a warning, never swallowed into a success toast.
   */
  notice?: string;
  /** What actually happened, for a success message that tells the truth. */
  done?: string;
};

/** Initial value for `useActionState`. */
export const EMPTY_STATE: ActionState = {};
