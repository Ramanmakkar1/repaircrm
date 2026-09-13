import { format } from "date-fns";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newRecordLocationId } from "@/lib/location";
import { paymentsLive, readTerminalLocationId, stripeTestMode } from "@/lib/payments";
import { listSquareDevices, squareConnectionStatus } from "@/lib/payments/square";
import { DrawerStrip } from "@/components/pos/drawer-strip";
import { Register } from "@/components/pos/register";
import { customerLabel } from "@/components/billing/queries";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import type { PosProduct, PosTicket } from "@/components/pos/types";
import { resolveTaxRate } from "@/lib/tax";

export const metadata = { title: "POS · RepairPilot" };

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
  const { shopId, userId, role } = await requireUser();
  // The branch this till is standing in. Resolved before the queries because
  // the drawer session is scoped to it.
  const drawerLocationId = await newRecordLocationId(shopId, userId);

  const [products, customerRows, ticketRows, shop, taxRates, drawer] =
    await Promise.all([
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
          taxExempt: true,
          taxRateId: true,
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
          // Only deposits still sitting unapplied count — `Ticket.depositCents`
          // is the lifetime total and would double-count a refunded one.
          deposits: {
            where: { appliedInvoiceId: null, refundedAt: null },
            select: { amountCents: true },
          },
        },
      }),
      db.shop.findUnique({
        where: { id: shopId },
        select: { taxRateBps: true, settings: true },
      }),
      db.taxRate.findMany({
        where: { shopId },
        select: {
          id: true,
          name: true,
          rateBps: true,
          isDefault: true,
          active: true,
        },
      }),
      // The open cash-drawer session for the branch this register is standing in
      // — resolved the same way openDrawerAction resolves it, so the till on
      // screen is the till that was opened here.
      db.cashDrawerSession.findFirst({
        where: { shopId, locationId: drawerLocationId, closedAt: null },
        orderBy: { openedAt: "desc" },
        select: {
          id: true,
          openedAt: true,
          openingCents: true,
          openedBy: { select: { name: true } },
        },
      }),
    ]);

  const square = await squareConnectionStatus(shopId);
  const squareDevices = square.connected ? await listSquareDevices(shopId) : [];

  const shopTax = { taxRateBps: shop?.taxRateBps ?? 0, taxRates };

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
    depositCents: ticket.deposits.reduce(
      (sum, deposit) => sum + deposit.amountCents,
      0,
    ),
  }));

  const posProducts: PosProduct[] = products;

  return (
    <Register
      products={posProducts}
      customers={customerRows.map((c) => {
        // The rate each customer resolves to, so attaching them at the counter
        // re-prices the cart instantly. performCheckout resolves it again —
        // this is the display half, never the authority.
        const tax = resolveTaxRate({ shop: shopTax, customer: c });
        return {
          id: c.id,
          label: customerLabel(c),
          creditBalanceCents: c.creditBalanceCents,
          taxRateBps: tax.taxRateBps,
          taxExempt: c.taxExempt,
        };
      })}
      // The reader option appears only for a shop that has actually registered
      // one — an empty Terminal Location means no hardware was ever paired, and
      // a dead button on every till in the world is not a feature. `testMode`
      // is the only thing derived from the Stripe key that crosses to the
      // browser, and it is a boolean.
      cardReader={{
        enabled: paymentsLive() && Boolean(readTerminalLocationId(shop?.settings)),
        testMode: stripeTestMode(),
        squareDevices: squareDevices.map((device) => ({
          id: device.deviceId ?? device.id,
          name: device.name,
          status: device.status,
        })),
      }}
      tickets={tickets}
      taxRateBps={shop?.taxRateBps ?? 0}
      drawer={
        // Keyed because this element crosses the server/client boundary as a
        // prop: React re-validates it on the client and warns without one.
        <DrawerStrip
          key="drawer"
          isOwner={role === "OWNER"}
          drawer={
            drawer
              ? {
                  id: drawer.id,
                  // Formatted here rather than in the strip: see OpenDrawer.
                  openedAtLabel: format(drawer.openedAt, "h:mm a"),
                  openedByName: drawer.openedBy.name,
                  openingCents: drawer.openingCents,
                }
              : null
          }
        />
      }
    />
  );
}
