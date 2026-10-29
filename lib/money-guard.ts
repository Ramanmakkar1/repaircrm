/**
 * Server-side enforcement of the money policy in lib/money-access.ts.
 *
 * Server only: it reads the session. Never import this from a "use client" file;
 * import `canSeeMoney` from lib/money-access.ts there instead.
 */

import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { canSeeMoney } from "@/lib/money-access";

/**
 * For a money page (invoices, estimates, POS, drawers, money print pages): the
 * session, or a 404 for a technician. A 404 rather than a redirect, so a stale
 * invoice link in a tech's history says "not here" instead of bouncing them.
 */
export async function requireMoneyUser() {
  const user = await requireUser();
  if (!canSeeMoney(user.role)) notFound();
  return user;
}

/** For a money action: the session, or null for a role that may not touch money (return MONEY_REFUSED). */
export async function moneyActor() {
  const user = await requireUser();
  return canSeeMoney(user.role) ? user : null;
}
