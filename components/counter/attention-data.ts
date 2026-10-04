/**
 * The counts behind "Needs you" (see ./attention.ts), read from the database.
 *
 * Server-only: Home renders it straight away, and /api/app-search/attention
 * serves the same numbers to the bell and the phone tab bar. Every query is
 * scoped to the session's shop (and the chosen branch where the record has
 * one), and the money count is never run for a role that may not see money.
 *
 * Each count matches the list it opens, query for query: "Ready for pickup"
 * is /tickets?status=Ready for Pickup, "Customer replies" is the Repairs
 * Needs reply view, "Low stock" is the Stock low view, and so on.
 */

import { db } from "@/lib/db";
import { needsReplyTicketIds } from "@/lib/needs-reply";
import { READY_FOR_PICKUP_STATUS, RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import { attentionShowsMoney, type AttentionCounts } from "./attention";

export type AttentionScope = { shopId: string; role: string };
export type AttentionBranch = { locationId?: string };

export async function loadAttentionCounts(
  user: AttentionScope,
  branch: AttentionBranch,
  now: Date = new Date(),
): Promise<AttentionCounts> {
  const { shopId, role } = user;
  // Spread only a real branch id: an empty object means "every branch".
  const where = branch.locationId ? { shopId, locationId: branch.locationId } : { shopId };

  const [ready, overdue, replies, enquiries, unpaid, low] = await Promise.all([
    db.ticket.count({ where: { ...where, status: READY_FOR_PICKUP_STATUS } }),
    // "Late" is an instant, not a day: due before now and still open.
    db.ticket.count({ where: { ...where, NOT: { status: RESOLVED_STATUS }, dueDate: { lt: now } } }),
    needsReplyTicketIds(shopId, branch.locationId).then((ids) => ids.length),
    // Enquiries and products belong to the shop, not a branch.
    db.lead.count({ where: { shopId, status: "NEW" } }),
    attentionShowsMoney(role)
      ? db.invoice.count({ where: { ...where, status: { in: ["SENT", "PARTIAL"] } } })
      : Promise.resolve(0),
    db.product.count({ where: { shopId, active: true, lowStockAt: { gte: db.product.fields.stockQty } } }),
  ]);

  return { ready, overdue, replies, enquiries, unpaid, low };
}
