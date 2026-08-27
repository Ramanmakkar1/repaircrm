/**
 * Shapes shared between the POS register (client) and its server action.
 *
 * Nothing here may import Prisma — the register is a Client Component and this
 * module travels with it. Payment methods are a plain string union that mirrors
 * the `PaymentMethod` enum in schema.prisma.
 */

export type TenderMethod = "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT";

export const TENDER_METHODS: readonly TenderMethod[] = [
  "CASH",
  "CARD",
  "CHECK",
  "OTHER",
  "CREDIT",
];

export const METHOD_LABELS: Record<TenderMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  OTHER: "Other",
  CREDIT: "Store credit",
};

/** A sellable product, as the register grid needs it. */
export type PosProduct = {
  id: string;
  name: string;
  priceCents: number;
  taxable: boolean;
  stockQty: number;
  sku: string | null;
  upc: string | null;
  category: string | null;
  lowStockAt: number | null;
};

/**
 * Whether a product is a countable thing rather than a service.
 *
 * The schema has no "track stock" flag, but it does document `lowStockAt` as
 * the reorder threshold, with null meaning "no low-stock alerts for this one" —
 * which is exactly what a labour line is. Treating null-threshold-and-no-stock
 * as untracked keeps every hourly rate on the register from wearing a red
 * out-of-stock dot forever.
 */
export function tracksStock(product: {
  stockQty: number;
  lowStockAt: number | null;
}): boolean {
  return product.lowStockAt !== null || product.stockQty > 0;
}

/** A customer the sale can be attached to. */
export type PosCustomer = {
  id: string;
  label: string;
  creditBalanceCents: number;
};

/**
 * One row in the client-side cart.
 *
 * `productId === null` marks a custom (typed-at-the-counter) item: its price is
 * the only price the server has to go on. Catalogue rows carry a productId and
 * the server re-reads name/price/taxable from the database, so a tampered
 * client can never set its own price on a real product.
 */
export type CartLine = {
  /** Stable client-only key; never sent to the server. */
  key: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  taxable: boolean;
  quantity: number;
  /** Stock level at page load, for the low/out-of-stock hint. Null for custom. */
  stockQty: number | null;
};

/** What the register posts to `checkoutAction`. */
export type CheckoutInput = {
  lines: {
    productId: string | null;
    /** Only trusted for custom lines. */
    description: string;
    /** Only trusted for custom lines. */
    unitPriceCents: number;
    /** Only trusted for custom lines. */
    taxable: boolean;
    quantity: number;
  }[];
  customerId: string | null;
  method: TenderMethod;
  reference: string | null;
  /** Cash only: what the customer handed over, in cents. */
  tenderedCents: number | null;
};

export type CheckoutResult =
  | {
      ok: true;
      invoiceId: string;
      number: number;
      totalCents: number;
      changeDueCents: number;
      method: TenderMethod;
    }
  | { ok: false; error: string };
