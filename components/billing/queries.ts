import { db } from "@/lib/db";
import type { CustomerOption, ProductOption } from "./types";

/**
 * Server-only loaders shared by the estimate and invoice route segments.
 * Never import this from a Client Component — it pulls in Prisma.
 */

export function customerLabel(customer: {
  firstName: string;
  lastName: string;
  businessName: string | null;
}): string {
  const person = `${customer.firstName} ${customer.lastName}`.trim();
  return customer.businessName ? `${customer.businessName} — ${person}` : person;
}

/**
 * Everything the shared DocumentForm needs: the shop's customers, its sellable
 * products, and the tax rate a new document will snapshot.
 */
export async function loadDocumentFormData(shopId: string): Promise<{
  customers: CustomerOption[];
  products: ProductOption[];
  taxRateBps: number;
}> {
  const [customerRows, productRows, shop] = await Promise.all([
    db.customer.findMany({
      where: { shopId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        // Only whether a card exists — never the payment method id, which is a
        // handle to a real card.
        stripePaymentMethodId: true,
      },
    }),
    db.product.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        priceCents: true,
        taxable: true,
      },
    }),
    db.shop.findUnique({
      where: { id: shopId },
      select: { taxRateBps: true },
    }),
  ]);

  return {
    customers: customerRows.map((c) => ({
      id: c.id,
      label: customerLabel(c),
      hasCard: Boolean(c.stripePaymentMethodId),
    })),
    products: productRows,
    taxRateBps: shop?.taxRateBps ?? 0,
  };
}

/** The shop block printed at the top of every document. */
export async function loadShopHeader(shopId: string) {
  return db.shop.findUnique({
    where: { id: shopId },
    select: {
      name: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      phone: true,
      email: true,
      taxRateBps: true,
    },
  });
}
