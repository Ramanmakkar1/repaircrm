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
 * An open ticket carrying work that has not been billed yet.
 *
 * This is the bridge the owner asked for: a repair finishes at the bench, the
 * customer walks up to the counter, and the cashier rings the job through the
 * same register as a phone case instead of detouring to the ticket screen to
 * raise an invoice.
 */
export type PosTicket = {
  id: string;
  number: number;
  customerId: string;
  customerLabel: string;
  subject: string;
  /** The un-invoiced charges only — the ones this sale would consume. */
  charges: PosTicketCharge[];
  /** Tax-exclusive sum of those charges, for the picker list. */
  subtotalCents: number;
};

export type PosTicketCharge = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

/**
 * One row in the client-side cart.
 *
 * `productId === null` marks a custom (typed-at-the-counter) item: its price is
 * the only price the server has to go on. Catalogue rows carry a productId and
 * the server re-reads name/price/taxable from the database, so a tampered
 * client can never set its own price on a real product.
 *
 * `ticketChargeId` marks a LOCKED line pulled off a repair ticket. Its quantity
 * and price are the ticket's, not the cashier's — the customer was quoted them
 * on the bench — so the register renders it read-only and the server re-reads
 * both from the TicketCharge row anyway.
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
  /** Set on locked ticket lines; null on catalogue and custom lines. */
  ticketChargeId?: string | null;
  /** The ticket a locked line came off, for grouping and the header label. */
  ticketId?: string | null;
  ticketNumber?: number | null;
};

/** True for a line pulled off a repair ticket — read-only in the cart. */
export function isTicketLine(line: CartLine): boolean {
  return Boolean(line.ticketChargeId);
}

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
    /**
     * Set for a line pulled off a ticket. Nothing else about the line is
     * trusted then: the server re-reads description, quantity, price and
     * taxability from the TicketCharge row.
     */
    ticketChargeId?: string | null;
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
      /** Set when the sale billed a repair ticket, so the receipt can link it. */
      ticketId: string | null;
      ticketNumber: number | null;
    }
  | { ok: false; error: string };
