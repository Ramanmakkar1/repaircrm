/**
 * Which Stripe account a shop's calls go to.
 *
 * A one-function module, split out of ./connect.ts on purpose: connect.ts
 * imports `node:crypto` to sign its OAuth `state`, and every other file in
 * lib/payments needs THIS and nothing else from it. Keeping them together
 * dragged `node:crypto` into the import graph of the background-jobs runner,
 * which Next also compiles for the Edge runtime — a warning on every build for
 * a dependency nothing there actually uses.
 */

import { db } from "@/lib/db";

/**
 * The connected account id for a shop, or null for direct mode.
 *
 * EVERY Stripe call made on a shop's behalf passes this to `stripeFetch`. It
 * is read from the database by shopId — never accepted from a caller — so the
 * account a charge lands in is decided by the tenant boundary, not the wire.
 *
 * Null is not an error: a shop that never onboarded through Connect runs on
 * the platform key, which is how every shop worked before Connect existed.
 */
export async function accountFor(shopId: string): Promise<string | null> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { stripeAccountId: true },
  });
  return shop?.stripeAccountId ?? null;
}
