/**
 * The rules behind the Easy-mode "New order" screen, kept pure (no React, no
 * db) so they can be tested on their own: who the order is for, what is on it,
 * the "Running low" one-tap fill, what is still missing, and exactly what the
 * form posts.
 *
 * What is posted is the same as the old purchase order form has always sent
 * to createPurchaseOrderAction: `vendorId`, `lines` (JSON of productId /
 * description / quantity / unitCostCents), `shippingCents`, `expectedAt`,
 * `notes`. The only addition is `intent` ("place" or "draft"), which the action
 * reads as optional: anything else still makes a draft, as before.
 */

import { poTotals, suggestedReorderQty } from "./purchasing";

/** A product the order can be built from, with what its tile needs. */
export type PoBuilderProduct = {
  id: string;
  name: string;
  sku: string | null;
  vendorSku: string | null;
  vendorId: string | null;
  costCents: number | null;
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
  /** At or below the reorder point right now (decided on the server, one rule). */
  low: boolean;
  /** Already on an order that has not fully arrived. */
  onOrder?: number;
  category?: string | null;
  catalogImage?: string | null;
  imageUrl?: string | null;
};

export type PoBuilderVendor = {
  id: string;
  name: string;
  /** How many catalogue products name this supplier. */
  productCount?: number;
};

export type PoLine = {
  key: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitCostCents: number;
};

export type PoDraft = {
  vendorId: string;
  lines: PoLine[];
  shippingCents: number;
  /** yyyy-mm-dd, or "" for no date. */
  expectedAt: string;
  notes: string;
  /** Counts up so every new line gets its own key. */
  nextKey: number;
};

export const PO_STEPS = [
  { label: "Supplier", title: "Who are you ordering from?", hint: "Tap the supplier you are buying from." },
  { label: "Items", title: "What do you need?", hint: "Tap a picture to add it. Running low adds everything that is low in one go." },
  { label: "Check", title: "Check and place the order", hint: "Change how many, add shipping if there is any, then place the order." },
] as const;

export const PO_LAST_STEP = PO_STEPS.length - 1;

/** An empty order. A supplier is only filled in when the address named one on purpose. */
export function emptyDraft(vendorId = ""): PoDraft {
  return { vendorId, lines: [], shippingCents: 0, expectedAt: "", notes: "", nextKey: 0 };
}

/**
 * `?add=productId:qty,productId:qty` (from "Order more" and "Order the rest"):
 * the catalogue products to start the order with. Unknown ids and silly
 * quantities are dropped rather than trusted.
 */
export function parseAddParam(raw: string | undefined, products: readonly PoBuilderProduct[]): { product: PoBuilderProduct; quantity: number }[] {
  if (!raw) return [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const out: { product: PoBuilderProduct; quantity: number }[] = [];
  for (const part of raw.split(",")) {
    const [id, qtyText] = part.split(":");
    const product = byId.get((id ?? "").trim());
    if (!product || out.some((entry) => entry.product.id === product.id)) continue;
    const qty = Number.parseInt(qtyText ?? "", 10);
    out.push({ product, quantity: Number.isFinite(qty) && qty > 0 ? Math.min(qty, 100_000) : suggestedReorderQty(product) });
  }
  return out;
}

/** The order the screen opens with: an explicit supplier and any products the address asked for. */
export function initialDraft(input: {
  vendorId?: string;
  add?: string;
  vendors: readonly PoBuilderVendor[];
  products: readonly PoBuilderProduct[];
}): PoDraft {
  const vendorId = input.vendorId && input.vendors.some((vendor) => vendor.id === input.vendorId) ? input.vendorId : "";
  let draft = emptyDraft(vendorId);
  for (const { product, quantity } of parseAddParam(input.add, input.products)) {
    draft = addProduct(draft, product, quantity);
  }
  return draft;
}

/** The step to open on: the items once a supplier is known, the supplier otherwise. */
export function initialStep(draft: PoDraft): number {
  return draft.vendorId ? 1 : 0;
}

/** How many of a product are on the order. */
export function quantityOf(draft: PoDraft, productId: string): number {
  return draft.lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

/** How many a tap on a product's "Add" puts on: its reorder quantity when it is low, otherwise one. */
export function firstTapQuantity(product: PoBuilderProduct): number {
  return product.low ? suggestedReorderQty(product) : 1;
}

/** Adds a product (or more of it, when it is already on the order). */
export function addProduct(draft: PoDraft, product: PoBuilderProduct, quantity = 1): PoDraft {
  const qty = Math.max(1, Math.round(quantity));
  const existing = draft.lines.find((line) => line.productId === product.id);
  if (existing) {
    return { ...draft, lines: draft.lines.map((line) => (line === existing ? { ...line, quantity: Math.min(100_000, line.quantity + qty) } : line)) };
  }
  const line: PoLine = {
    key: `line-${draft.nextKey}`,
    productId: product.id,
    description: product.name,
    quantity: Math.min(100_000, qty),
    unitCostCents: Math.max(0, product.costCents ?? 0),
  };
  return { ...draft, lines: [...draft.lines, line], nextKey: draft.nextKey + 1 };
}

/** Something not in the catalogue: a name, how many, what each costs. */
export function addOneOff(draft: PoDraft, item: { description: string; quantity: number; unitCostCents: number }): PoDraft {
  const description = item.description.trim();
  if (!description) return draft;
  const line: PoLine = {
    key: `line-${draft.nextKey}`,
    productId: null,
    description: description.slice(0, 300),
    quantity: Math.min(100_000, Math.max(1, Math.round(item.quantity))),
    unitCostCents: Math.max(0, Math.round(item.unitCostCents)),
  };
  return { ...draft, lines: [...draft.lines, line], nextKey: draft.nextKey + 1 };
}

/** Sets a line's quantity; zero (or less) takes the line off. */
export function setQuantity(draft: PoDraft, key: string, quantity: number): PoDraft {
  const qty = Math.round(quantity);
  if (qty <= 0) return { ...draft, lines: draft.lines.filter((line) => line.key !== key) };
  return { ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(100_000, qty) } : line)) };
}

/** A product's quantity by product id (the tile's stepper). */
export function setProductQuantity(draft: PoDraft, product: PoBuilderProduct, quantity: number): PoDraft {
  const line = draft.lines.find((entry) => entry.productId === product.id);
  if (!line) return quantity > 0 ? addProduct(draft, product, quantity) : draft;
  return setQuantity(draft, line.key, quantity);
}

export function setCost(draft: PoDraft, key: string, unitCostCents: number): PoDraft {
  const cents = Math.max(0, Math.round(unitCostCents));
  return { ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, unitCostCents: cents } : line)) };
}

export function removeLine(draft: PoDraft, key: string): PoDraft {
  return { ...draft, lines: draft.lines.filter((line) => line.key !== key) };
}

/**
 * What "Running low" would add for this supplier: every product at or below its
 * reorder point that this supplier sells, or that names no supplier at all (it
 * can be bought anywhere), and that is not on the order yet. Same rule the old
 * "Add low-stock items" button used.
 */
export function lowItemsFor(products: readonly PoBuilderProduct[], vendorId: string): PoBuilderProduct[] {
  return products.filter((product) => product.low && (vendorId === "" || product.vendorId === null || product.vendorId === vendorId));
}

/** One tap: every low item for this supplier, each at its suggested quantity. Items already on the order are left alone. */
export function addLowItems(draft: PoDraft, products: readonly PoBuilderProduct[]): { draft: PoDraft; added: number } {
  let next = draft;
  let added = 0;
  for (const product of lowItemsFor(products, draft.vendorId)) {
    if (quantityOf(next, product.id) > 0) continue;
    next = addProduct(next, product, suggestedReorderQty(product));
    added++;
  }
  return { draft: next, added };
}

/** The products this supplier sells, first; everything else after. */
export function productsForSupplier(products: readonly PoBuilderProduct[], vendorId: string): { mine: PoBuilderProduct[]; others: PoBuilderProduct[] } {
  const mine: PoBuilderProduct[] = [];
  const others: PoBuilderProduct[] = [];
  for (const product of products) (vendorId && product.vendorId === vendorId ? mine : others).push(product);
  return { mine, others };
}

/** Name, SKU or supplier part number contains every word typed. */
export function searchProducts(products: readonly PoBuilderProduct[], query: string): PoBuilderProduct[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...products];
  return products.filter((product) => {
    const text = `${product.name} ${product.sku ?? ""} ${product.vendorSku ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Exactly what the `lines` field posts (the old form's shape). */
export function linesPayload(draft: PoDraft): { productId: string | null; description: string; quantity: number; unitCostCents: number }[] {
  return draft.lines.map((line) => ({
    productId: line.productId,
    description: line.description.trim(),
    quantity: line.quantity,
    unitCostCents: line.unitCostCents,
  }));
}

/** Every hidden field the form posts, as [name, value] pairs. */
export function draftFields(draft: PoDraft): [string, string][] {
  return [
    ["vendorId", draft.vendorId],
    ["lines", JSON.stringify(linesPayload(draft))],
    ["shippingCents", String(Math.max(0, Math.round(draft.shippingCents)))],
    ["expectedAt", draft.expectedAt],
    ["notes", draft.notes],
  ];
}

export function draftTotals(draft: PoDraft) {
  return poTotals(draft.lines, draft.shippingCents);
}

export type PoIssue = { step: number; message: string };

/** What stops the order being saved, and on which step it is fixed. */
export function draftIssues(draft: PoDraft): PoIssue[] {
  const issues: PoIssue[] = [];
  if (!draft.vendorId) issues.push({ step: 0, message: "Choose who you are ordering from." });
  if (draft.lines.length === 0) issues.push({ step: 1, message: "Add at least one item." });
  return issues;
}

/** "3 items · $120.00" for the phone's bar; "Nothing added yet" when empty. */
export function summaryWords(draft: PoDraft, totalLabel: string): string {
  const count = draft.lines.reduce((sum, line) => sum + line.quantity, 0);
  if (count === 0) return "Nothing added yet";
  return `${count} ${count === 1 ? "item" : "items"} · ${totalLabel}`;
}

/** "12.50", "$12.50", "1,200" -> cents; null when it is not a plain amount of money. */
export function parseMoneyText(text: string): number | null {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "").trim();
  if (clean === "") return 0;
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(clean)) return null;
  return Math.round(Number.parseFloat(clean) * 100);
}

/** Cents -> the text a money box starts with ("12.50"). */
export function moneyText(cents: number): string {
  return (Math.max(0, Math.round(cents)) / 100).toFixed(2);
}

/** "2 left · reorder at 5 · 3 on order" — the quiet line on a product tile. */
export function stockLine(product: Pick<PoBuilderProduct, "stockQty" | "lowStockAt" | "onOrder">): string {
  const parts: string[] = [];
  if (product.lowStockAt == null && product.stockQty <= 0) parts.push("Not counted");
  else parts.push(`${product.stockQty} left`);
  if (product.lowStockAt != null) parts.push(`reorder at ${product.lowStockAt}`);
  if (product.onOrder && product.onOrder > 0) parts.push(`${product.onOrder} on order`);
  return parts.join(" · ");
}
