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

/**
 * Housekeeping: dead phone-scanner pairings.
 *
 * A ScanSession is a half-hour rope between a till and a phone (lib/scan/
 * pairing.ts). Once it has lapsed it can authenticate nothing and feed nobody,
 * so the row and its ScanEvent children — which cascade — are deleted.
 *
 * THE ONE-DAY TAIL. Same reasoning as the portal tokens above, for a different
 * reason: a phone that posts into a pairing which lapsed while it was in
 * somebody's pocket should be told "that till has disconnected", and that
 * sentence needs the row to still be there. A day is long enough to cover a
 * shift, and short enough that the table never becomes a log.
 */
export const SCAN_SESSION_GRACE_HOURS = 24;

/**
 * Deletes one shop's long-dead pairings and returns the count.
 *
 * Scoped by `shopId` like every other query in the app (see lib/db.ts), so a
 * shop's run can only ever clear that shop's rows. Sessions that were hung up
 * early count too: `endedAt` is as final as expiry.
 */
export async function purgeExpiredScanSessions(shopId: string): Promise<number> {
  const cutoff = new Date(Date.now() - SCAN_SESSION_GRACE_HOURS * 60 * 60 * 1000);

  const deleted = await db.scanSession.deleteMany({
    where: {
      shopId,
      OR: [{ expiresAt: { lt: cutoff } }, { endedAt: { lt: cutoff } }],
    },
  });

  return deleted.count;
}
