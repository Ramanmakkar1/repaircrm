/**
 * Restocking: from "this is running low" to an order, decided in one pure place
 * so the Stock list's buttons and the server action can never disagree.
 */

import { suggestedReorderQty } from "./purchasing";

export type LowProduct = {
  id: string;
  name: string;
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
  costCents: number | null;
  vendorId: string | null;
  vendor: { id: string; name: string; active: boolean } | null;
};

export type OpenOrderLine = { productId: string | null; quantity: number; receivedQty: number };

export type RestockGroup = {
  vendorId: string;
  vendorName: string;
  lines: { productId: string; description: string; quantity: number; unitCostCents: number }[];
};

/** How many of each product are still to come on open orders. */
export function onOrderByProduct(lines: readonly OpenOrderLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines) {
    if (!line.productId) continue;
    const left = Math.max(0, line.quantity - line.receivedQty);
    if (left > 0) out.set(line.productId, (out.get(line.productId) ?? 0) + left);
  }
  return out;
}

/**
 * One draft's worth of lines per supplier, for "Order all low items".
 *
 *  - Already coming on an open order: left out (pressing twice must not order twice).
 *  - No supplier, or a retired one: left out and counted, because an order needs
 *    someone to send it to and guessing one would be worse than asking.
 *  - Everything else: its suggested quantity, at the cost on file.
 */
export function planLowStockOrders(
  products: readonly LowProduct[],
  openLines: readonly OpenOrderLine[],
): { groups: RestockGroup[]; noSupplier: LowProduct[]; alreadyOrdered: LowProduct[] } {
  const coming = onOrderByProduct(openLines);
  const groups = new Map<string, RestockGroup>();
  const noSupplier: LowProduct[] = [];
  const alreadyOrdered: LowProduct[] = [];

  for (const product of products) {
    if ((coming.get(product.id) ?? 0) > 0) {
      alreadyOrdered.push(product);
      continue;
    }
    if (!product.vendorId || !product.vendor || !product.vendor.active) {
      noSupplier.push(product);
      continue;
    }
    const group = groups.get(product.vendorId) ?? { vendorId: product.vendorId, vendorName: product.vendor.name, lines: [] };
    group.lines.push({
      productId: product.id,
      description: product.name,
      quantity: suggestedReorderQty(product),
      unitCostCents: Math.max(0, product.costCents ?? 0),
    });
    groups.set(product.vendorId, group);
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    noSupplier,
    alreadyOrdered,
  };
}

/**
 * Where "Order more" on one low product goes: a new order with it already on,
 * at its suggested quantity, for its own supplier when it has one (an explicit
 * choice, not a guess); otherwise the screen asks who to order from.
 */
export function orderMoreHref(product: { id: string; vendorId: string | null; stockQty: number; lowStockAt: number | null; reorderQty: number | null }): string {
  const params = new URLSearchParams();
  if (product.vendorId) params.set("vendorId", product.vendorId);
  params.set("add", `${product.id}:${suggestedReorderQty(product)}`);
  return `/inventory/purchase-orders/new?${params.toString()}`;
}

/** "2 orders ready to check: Meridian (3 items), Lone Star (1 item)." and the caveats, in words. */
export function lowStockResultWords(result: {
  orders?: { vendorName: string; lines: number }[];
  noSupplier?: number;
  alreadyOrdered?: number;
}): string {
  const orders = result.orders ?? [];
  const parts: string[] = [];
  if (orders.length === 0) parts.push("No new orders were needed.");
  else
    parts.push(
      `${orders.length === 1 ? "1 draft order is" : `${orders.length} draft orders are`} ready to check: ${orders
        .map((order) => `${order.vendorName} (${order.lines} ${order.lines === 1 ? "item" : "items"})`)
        .join(", ")}.`,
    );
  if (result.alreadyOrdered) parts.push(`${result.alreadyOrdered} already on order.`);
  if (result.noSupplier) parts.push(`${result.noSupplier} ${result.noSupplier === 1 ? "has" : "have"} no supplier set: order ${result.noSupplier === 1 ? "it" : "them"} with New order.`);
  return parts.join(" ");
}
