/**
 * The post-pickup review request.
 *
 * A plain server module — NOT "use server". Nothing here is callable from the
 * browser: the runner in lib/jobs/index.ts passes the shopId in, the same way
 * the campaign engine is called.
 *
 * THE QUEUE IS THE TICKET ITSELF
 * ------------------------------
 * There is no queue table. A ticket qualifies when it carries a `pickedUpAt`
 * older than the shop's delay and has no `reviewRequestedAt` — so the counter
 * pressing "Mark picked up" IS the enqueue, and the stamp is the claim.
 *
 * `reviewRequestedAt` is written whether or not the message actually left the
 * building. A shop that has opted a customer out, or a provider that bounced,
 * must not turn into a request retried every fifteen minutes forever; lib/comms
 * has already filed the outbox row saying what happened.
 */

import { db } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/comms";
import {
  readReviewSettings,
  renderReviewMessage,
  safeExternalUrl,
} from "@/components/settings/checkin-meta";

/** Enough to clear a busy Saturday; small enough that one pass stays quick. */
const MAX_PER_RUN = 50;

export type ReviewRunResult = {
  sent: number;
  errors: string[];
};

export async function runDueReviewRequestsForShop(
  shopId: string,
): Promise<ReviewRunResult> {
  const result: ReviewRunResult = { sent: 0, errors: [] };

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true, settings: true },
  });
  if (!shop) return result;

  const settings = readReviewSettings(shop.settings);
  if (!settings.enabled) return result;

  // No link, no request. A review ask with nowhere to go is worse than silence.
  const link = safeExternalUrl(settings.url);
  if (!link) {
    result.errors.push("reviews are on but the review link is missing or not a web address");
    return result;
  }

  const cutoff = new Date(Date.now() - settings.delayHours * 60 * 60 * 1000);

  const tickets = await db.ticket.findMany({
    where: {
      shopId,
      pickedUpAt: { not: null, lte: cutoff },
      reviewRequestedAt: null,
      // Somebody we can actually reach: an address, or a mobile they asked us
      // to text. Anyone else stays pending rather than burning their one shot.
      customer: {
        OR: [
          { email: { not: null } },
          { AND: [{ smsOptIn: true }, { mobile: { not: null } }] },
        ],
      },
    },
    orderBy: { pickedUpAt: "asc" },
    take: MAX_PER_RUN,
    select: {
      id: true,
      number: true,
      customerId: true,
      customer: {
        select: { firstName: true, email: true, mobile: true, smsOptIn: true },
      },
    },
  });

  for (const ticket of tickets) {
    const body = renderReviewMessage(settings.template, {
      customer: ticket.customer.firstName,
      shop: shop.name,
      link,
    });

    try {
      const useSms = ticket.customer.smsOptIn && Boolean(ticket.customer.mobile);

      const outcome = useSms
        ? await sendSms({
            shopId,
            customerId: ticket.customerId,
            ticketId: ticket.id,
            body,
            portalPath: `/portal/tickets/${ticket.id}`,
          })
        : await sendEmail({
            shopId,
            customerId: ticket.customerId,
            ticketId: ticket.id,
            subject: `How did we do?`,
            body,
            context: `Ticket #${ticket.number} · ${shop.name}`,
            portalPath: `/portal/tickets/${ticket.id}`,
          });

      // Stamped either way — see the note at the top of this file.
      await db.ticket.update({
        where: { id: ticket.id },
        data: { reviewRequestedAt: new Date() },
      });

      if (outcome.ok) result.sent += 1;
    } catch (error) {
      result.errors.push(
        `ticket #${ticket.number}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}
