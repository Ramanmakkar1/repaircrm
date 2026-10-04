import { db } from "@/lib/db";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import type { BillKind, RepairOption } from "./flow";

/**
 * Server-only extras for the Easy-mode bill builder, loaded next to
 * loadDocumentFormData by /invoices/new and /estimates/new. Never import this
 * from a Client Component: it pulls in Prisma.
 *
 * Every query filters by the session's shopId (see lib/db.ts).
 */

/** Open repairs shown under "From repair": the ones touched most recently are the ones whose owners are at the counter. */
const REPAIR_LIMIT = 100;
const RECENT_LIMIT = 12;

/**
 * The people most recently billed (or checked in), newest first, as ids. The
 * customer step shows the first few of them to tap before anything is typed.
 */
export async function loadRecentCustomerIds(shopId: string, kind: BillKind): Promise<string[]> {
  const [documents, repairs] = await Promise.all([
    kind === "invoice"
      ? db.invoice.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 40, select: { customerId: true } })
      : db.estimate.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 40, select: { customerId: true } }),
    db.ticket.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 20, select: { customerId: true } }),
  ]);
  const ids: string[] = [];
  for (const row of [...documents, ...repairs]) {
    if (!ids.includes(row.customerId)) ids.push(row.customerId);
    if (ids.length === RECENT_LIMIT) break;
  }
  return ids;
}

/**
 * The shop's open repairs, for "From repair". A repair the page was opened for
 * (?ticketId=) is always included, open or not, so its link is never lost.
 */
export async function loadOpenRepairs(shopId: string, includeId?: string | null): Promise<RepairOption[]> {
  // Each repair carries its charges that are on no invoice yet: "From repair"
  // puts exactly those on the bill. A charge already billed is never offered.
  const select = {
    id: true,
    number: true,
    subject: true,
    customerId: true,
    status: true,
    charges: {
      where: { shopId, invoiceId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, productId: true, description: true, quantity: true, unitPriceCents: true, taxable: true },
    },
  } as const;
  const [open, requested] = await Promise.all([
    db.ticket.findMany({
      where: { shopId, status: { not: RESOLVED_STATUS } },
      orderBy: { updatedAt: "desc" },
      take: REPAIR_LIMIT,
      select,
    }),
    includeId ? db.ticket.findFirst({ where: { id: includeId, shopId }, select }) : null,
  ]);
  return requested && !open.some((repair) => repair.id === requested.id) ? [requested, ...open] : open;
}
