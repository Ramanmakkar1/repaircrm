import { db } from "@/lib/db";
import { NO_TAX, resolveTaxRate, type TaxRateOption } from "@/lib/tax";
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
  taxRates: TaxRateOption[];
}> {
  const [customerRows, productRows, shop, taxRates] = await Promise.all([
    db.customer.findMany({
      where: { shopId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        taxExempt: true,
        taxRateId: true,
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
    db.taxRate.findMany({
      where: { shopId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rateBps: true,
        isDefault: true,
        active: true,
      },
    }),
  ]);

  const shopTax = { taxRateBps: shop?.taxRateBps ?? 0, taxRates };

  return {
    // Each customer carries the tax they resolve to, so picking them in the
    // form can set the document's rate without a server round-trip. The server
    // action re-derives the same answer — this is convenience, not authority.
    customers: customerRows.map((c) => {
      const tax = resolveTaxRate({ shop: shopTax, customer: c });
      return {
        id: c.id,
        label: customerLabel(c),
        taxRateId: tax.taxRateId,
        taxRateBps: tax.taxRateBps,
        taxExempt: c.taxExempt,
      };
    }),
    products: productRows,
    taxRateBps: shop?.taxRateBps ?? 0,
    taxRates,
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

/**
 * The tax a document being saved should carry.
 *
 * The form's `taxRateId` is a REQUEST, not an answer: it is re-read against
 * this shop's own rates, so an id from another tenant (or one deleted while the
 * form sat open) falls back to what the customer resolves to rather than
 * silently taxing at someone else's number. When the form posted no field at
 * all — a shop with no named rates — the customer's resolution is the answer.
 *
 * Both halves are stored: `taxRateBps` is the snapshot the customer is shown,
 * `taxRateId` is where it came from.
 */
export async function resolveDocumentTax(
  shopId: string,
  customerId: string,
  requestedTaxRateId: FormDataEntryValue | string | null | undefined,
): Promise<{ taxRateId: string | null; taxRateBps: number }> {
  const [shop, taxRates, customer] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { taxRateBps: true } }),
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
    db.customer.findFirst({
      where: { id: customerId, shopId },
      select: { taxExempt: true, taxRateId: true },
    }),
  ]);

  const requested = String(requestedTaxRateId ?? "").trim();

  if (requested === NO_TAX) return { taxRateId: null, taxRateBps: 0 };

  if (requested) {
    const rate = taxRates.find((option) => option.id === requested);
    if (rate) return { taxRateId: rate.id, taxRateBps: rate.rateBps };
  }

  const resolved = resolveTaxRate({
    shop: { taxRateBps: shop?.taxRateBps ?? 0, taxRates },
    customer,
  });
  return { taxRateId: resolved.taxRateId, taxRateBps: resolved.taxRateBps };
}
