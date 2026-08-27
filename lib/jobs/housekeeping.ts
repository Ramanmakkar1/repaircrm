import { db } from "@/lib/db";

/**
 * Housekeeping: expired customer-portal magic links.
 *
 * A PortalToken is a bearer credential emailed to a customer. Once it has
 * expired it can no longer authenticate anything, so the row is dead weight —
 * but it is dead weight that still names a customer, so it is deleted rather
 * than left to accumulate forever.
 *
 * THE SEVEN-DAY TAIL. Rows are only removed once they have been expired for a
 * week, not the moment they lapse. "This link has expired, here's a fresh one"
 * needs the row to still exist to say so; deleting on the stroke of expiry
 * turns a friendly message into a blank 404 for anyone who clicks an old email
 * a day late.
 */
export const PORTAL_TOKEN_GRACE_DAYS = 7;

/**
 * Deletes one shop's long-expired portal tokens and returns the count.
 *
 * PortalToken has no `shopId` of its own — it hangs off Customer — so the
 * scope is applied through the relation. That keeps the job inside the same
 * tenant boundary as everything else (see lib/db.ts): a shop's run can only
 * ever delete that shop's rows, and a bug in the loop cannot take out a
 * neighbouring tenant's links.
 */
export async function purgeExpiredPortalTokens(shopId: string): Promise<number> {
  const cutoff = new Date(
    Date.now() - PORTAL_TOKEN_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  const deleted = await db.portalToken.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
      customer: { shopId },
    },
  });

  return deleted.count;
}
