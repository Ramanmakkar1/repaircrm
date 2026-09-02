import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Register } from "@/components/pos/register";
import { customerLabel } from "@/components/billing/queries";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import type { PosProduct, PosTicket } from "@/components/pos/types";

// The register reads live stock and prices; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

/**
 * The register screen.
 *
 * All the data the counter needs is loaded once, here, and handed to a single
 * client component: a walk-in sale should never wait on a round-trip to draw a
 * product tile. The only server round-trip in a sale is the checkout itself.
 */
export default async function PosPage() {
  const { shopId } = await requireUser();

  const [products, customerRows, ticketRows, shop] = await Promise.all([
    db.product.findMany({
      where: { shopId, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        priceCents: true,
        taxable: true,
        stockQty: true,
        sku: true,
        upc: true,
        category: true,
        lowStockAt: true,
        serialized: true,
        // Only what's on the shelf: the picker at the counter must never offer
        // a unit that has already been sold.
        serials: {
          where: { status: "IN_STOCK" },
          orderBy: { serial: "asc" },
          select: { id: true, serial: true },
        },
      },
    }),
    db.customer.findMany({
      where: {
        shopId,
        // The "Walk-in Customer" placeholder backs anonymous sales; offering it
        // in the attach list next to the real "Walk-in" default would just be
        // two ways to say the same thing.
        NOT: { firstName: "Walk-in", lastName: "Customer" },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        creditBalanceCents: true,
      },
    }),
    // Tickets the counter can bill: still open, and carrying work nobody has
    // invoiced yet. `charges: { some: { invoiceId: null } }` is the whole
    // filter — an already-invoiced repair has nothing left to sell, and
    // offering it would invite charging the customer twice.
    db.ticket.findMany({
      where: {
        shopId,
        status: { not: RESOLVED_STATUS },
        charges: { some: { invoiceId: null } },
      },
      orderBy: { updatedAt: "desc" },
      // A counter list, not a report: the recently-touched jobs are the ones
      // whose owners are standing at the desk.
      take: 50,
      select: {
        id: true,
        number: true,
        subject: true,
        customerId: true,
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        charges: {
          where: { invoiceId: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPriceCents: true,
            taxable: true,
          },
        },
      },
    }),
    db.shop.findUnique({
      where: { id: shopId },
      select: { taxRateBps: true },
    }),
  ]);

  const tickets: PosTicket[] = ticketRows.map((ticket) => ({
    id: ticket.id,
    number: ticket.number,
    customerId: ticket.customerId,
    customerLabel: customerLabel(ticket.customer),
    subject: ticket.subject,
    charges: ticket.charges,
    subtotalCents: ticket.charges.reduce(
      (sum, charge) => sum + charge.quantity * charge.unitPriceCents,
      0,
    ),
  }));

  const posProducts: PosProduct[] = products;

  return (
    <Register
      products={posProducts}
      customers={customerRows.map((c) => ({
        id: c.id,
        label: customerLabel(c),
        creditBalanceCents: c.creditBalanceCents,
      }))}
      tickets={tickets}
      taxRateBps={shop?.taxRateBps ?? 0}
    />
  );
}
