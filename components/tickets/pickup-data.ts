import { db } from "@/lib/db";
import { toPickupCard, type PickupCardData, type PickupDetails, type PickupTicket } from "./pickup-card-facts";

/**
 * Everything the pickup counter needs that the Repairs list does not already
 * load: the customer's number, when the repair became ready, and its money.
 *
 * One extra query for the page of repairs being drawn (never one per card),
 * filtered by the session's shop and by the ids the list already chose.
 */

export async function loadPickupCards(input: {
  shopId: string;
  tickets: readonly PickupTicket[];
  /** The status the list is filtered on, as spelled in this shop: the timeline entry for "moved to ready" is named after it. */
  readyStatus: string;
}): Promise<PickupCardData[]> {
  const { shopId, tickets, readyStatus } = input;
  if (tickets.length === 0) return [];

  const rows = (await db.ticket.findMany({
    where: { id: { in: tickets.map((ticket) => ticket.id) }, shopId },
    select: {
      id: true,
      customer: { select: { phone: true, mobile: true } },
      // The newest "moved to Ready for pickup" entry on the timeline. The
      // one-tap notice, the update composer and the bulk status menu all write
      // an entry named after the status they set.
      comments: {
        where: { shopId, updateType: readyStatus },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      invoices: {
        where: { shopId, status: { not: "VOID" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
          refunds: { select: { amountCents: true, status: true } },
        },
      },
      _count: { select: { charges: { where: { invoiceId: null } } } },
    },
  })) as PickupDetails[];

  const byId = new Map(rows.map((row) => [row.id, row]));
  return tickets.map((ticket) => toPickupCard(ticket, byId.get(ticket.id)));
}
