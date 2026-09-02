/**
 * Shared vocabulary for vendors, purchase orders and serial numbers.
 *
 * Pure by contract — no `db`, no `next/*`, no "use server" — because the server
 * actions, the list pages, the client dialogs and the printed PO all read from
 * it. (Same rule as components/tickets/part-meta.ts.)
 */

import type { StatusTone } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Purchase order status
// ---------------------------------------------------------------------------

export const PO_STATUSES = [
  "DRAFT",
  "ORDERED",
  "PARTIAL",
  "RECEIVED",
  "CANCELED",
] as const;

export type PoStatus = (typeof PO_STATUSES)[number];

export function asPoStatus(value: unknown): PoStatus {
  return PO_STATUSES.includes(value as PoStatus) ? (value as PoStatus) : "DRAFT";
}

/**
 * Where each PO state sits in the app-wide tone language (see
 * `components/ui/badge.tsx`): grey while it is only a plan, blue once money is
 * committed, amber part-way in, green when the boxes are all on the shelf,
 * struck through when called off. Only `StatusPill` knows what a tone looks
 * like, which is what keeps "Ordered" the same colour here, on the vendor
 * page and on the parts card.
 */
export const PO_STATUS_META: Record<
  PoStatus,
  { label: string; tone: StatusTone; struck?: boolean; hint: string }
> = {
  DRAFT: {
    label: "Draft",
    tone: "neutral",
    hint: "Not sent to the vendor yet.",
  },
  ORDERED: {
    label: "Ordered",
    tone: "info",
    hint: "Placed with the vendor, nothing received.",
  },
  PARTIAL: {
    label: "Partial",
    tone: "active",
    hint: "Some of it has arrived.",
  },
  RECEIVED: {
    label: "Received",
    tone: "success",
    hint: "Everything on the order is on the shelf.",
  },
  CANCELED: {
    label: "Canceled",
    tone: "neutral",
    struck: true,
    hint: "Called off before it arrived.",
  },
};

/** Statuses a PO can still be received against. */
export const RECEIVABLE_PO_STATUSES: readonly PoStatus[] = [
  "DRAFT",
  "ORDERED",
  "PARTIAL",
];

/** Statuses a PO can still be canceled from. */
export const CANCELABLE_PO_STATUSES: readonly PoStatus[] = ["DRAFT", "ORDERED"];

/** The list-page filter pills. "open" is the view a buyer lives in. */
export const PO_FILTERS = [
  "open",
  "all",
  "DRAFT",
  "ORDERED",
  "PARTIAL",
  "RECEIVED",
  "CANCELED",
] as const;

export type PoFilter = (typeof PO_FILTERS)[number];

export const PO_FILTER_LABELS: Record<PoFilter, string> = {
  open: "Open",
  all: "All",
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIAL: "Partial",
  RECEIVED: "Received",
  CANCELED: "Canceled",
};

export function asPoFilter(value: string | undefined): PoFilter {
  return (PO_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as PoFilter)
    : "open";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type PoLineLike = {
  quantity: number;
  unitCostCents: number;
  receivedQty?: number;
};

/**
 * A purchase order's money, in one place so the list, the detail page and the
 * printed sheet can never disagree.
 *
 * A PO is what the shop PAYS, so there is no sales tax on it — the vendor's
 * invoice carries whatever tax applies and it is not the shop's to compute.
 * Shipping is a flat add-on to the goods subtotal.
 */
export function poTotals(
  lines: readonly PoLineLike[],
  shippingCents: number,
): {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  orderedQty: number;
  receivedQty: number;
} {
  let subtotalCents = 0;
  let orderedQty = 0;
  let receivedQty = 0;

  for (const line of lines) {
    const qty = Math.max(0, Math.round(Number(line.quantity) || 0));
    subtotalCents += qty * Math.round(Number(line.unitCostCents) || 0);
    orderedQty += qty;
    receivedQty += Math.max(0, Math.round(Number(line.receivedQty) || 0));
  }

  const shipping = Math.max(0, Math.round(Number(shippingCents) || 0));
  return {
    subtotalCents,
    shippingCents: shipping,
    totalCents: subtotalCents + shipping,
    orderedQty,
    receivedQty,
  };
}

/**
 * The status a PO should be in after a receipt.
 *
 * Nothing received leaves the status alone (the caller passes the current one);
 * everything received is RECEIVED; anything in between is PARTIAL. Over-receipt
 * counts as complete — vendors ship an extra now and then and refusing to close
 * the order over it helps nobody.
 */
export function poStatusAfterReceipt(
  lines: readonly PoLineLike[],
  current: PoStatus,
): PoStatus {
  const totals = poTotals(lines, 0);
  if (totals.receivedQty <= 0) return current;
  return totals.receivedQty >= totals.orderedQty ? "RECEIVED" : "PARTIAL";
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

/**
 * How many of a low-stock product to put on the order.
 *
 * The shop's own `reorderQty` wins when it is set — that is the case pack or
 * the number the buyer has decided on. Otherwise: enough to reach twice the
 * reorder point, which leaves headroom rather than parking the product right
 * back on the low-stock banner. Never less than one.
 */
export function suggestedReorderQty(product: {
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
}): number {
  if (product.reorderQty != null && product.reorderQty > 0) {
    return product.reorderQty;
  }
  const target = (product.lowStockAt ?? 0) * 2;
  return Math.max(1, target - product.stockQty);
}

// ---------------------------------------------------------------------------
// Serial numbers
// ---------------------------------------------------------------------------

export const SERIAL_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  IN_STOCK: { label: "In stock", tone: "success" },
  SOLD: { label: "Sold", tone: "info" },
  RETURNED: { label: "Returned", tone: "active" },
  DEFECTIVE: { label: "Defective", tone: "danger" },
};

export function serialStatusLabel(status: string): string {
  return SERIAL_STATUS_META[status]?.label ?? status;
}
