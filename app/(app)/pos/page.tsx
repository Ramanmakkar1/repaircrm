import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Register } from "@/components/pos/register";
import { customerLabel } from "@/components/billing/queries";

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

  const [products, customerRows, shop] = await Promise.all([
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
    db.shop.findUnique({
      where: { id: shopId },
      select: { taxRateBps: true },
    }),
  ]);

  return (
    <Register
      products={products}
      customers={customerRows.map((c) => ({
        id: c.id,
        label: customerLabel(c),
        creditBalanceCents: c.creditBalanceCents,
      }))}
      taxRateBps={shop?.taxRateBps ?? 0}
    />
  );
}
