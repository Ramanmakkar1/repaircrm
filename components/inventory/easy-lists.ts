/**
 * The words and rules behind the Easy-mode (touch / POS style) stock and
 * purchasing lists.
 *
 * Pure by contract, like `format.ts` and `purchasing.ts`: no `db`, no
 * `next/*`, no React. The pages and cards read from here, so the wording of a
 * card ("36 left", "Expected Oct 4, 2026") is decided once and can be tested
 * without rendering anything.
 */

import type { Prisma } from "@prisma/client";

import { formatDate } from "@/components/billing/format";
import { stockStatus, type StockLevel } from "./format";
import type { PoStatus } from "./purchasing";

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * The big number on a stock card and the word under it.
 *
 * "36 left" for anything that is counted. A service or labour line that sits at
 * 0 by design (no reorder point) has no shelf to count, so it says so rather
 * than printing a "0 left" that reads like an emergency.
 */
export function stockCount(level: StockLevel): { value: string; unit: string } {
  if (stockStatus(level) === "untracked") return { value: "—", unit: "not counted" };
  return { value: String(level.stockQty), unit: "left" };
}

/** "$34.99 · ACC-CASE-IP14P" — the one quiet line under a product's name. */
export function stockSubtitle(product: { sku: string | null; priceLabel: string }): string {
  return `${product.sku?.trim() || "No SKU"} · ${product.priceLabel}`;
}

/** The detail line on a group box: "48 in stock · 3 items". */
export function groupDetail(quantity: number, itemCount: number): string {
  return `${quantity} in stock · ${itemCount} ${itemCount === 1 ? "item" : "items"}`;
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

/**
 * The date fact on a purchase order's card ("Expected Oct 4, 2026").
 *
 * What a buyer wants to know depends on where the order is: a draft has not
 * gone anywhere yet, an open order is waiting on a delivery date, a finished
 * order is history.
 */
export function poDateLabel(order: {
  status: PoStatus;
  expectedAt: Date | null;
  receivedAt?: Date | null;
}): string {
  if (order.status === "RECEIVED") {
    return order.receivedAt ? `Received ${formatDate(order.receivedAt)}` : "Received";
  }
  if (order.status === "CANCELED") return "Canceled";
  if (order.expectedAt) return `Expected ${formatDate(order.expectedAt)}`;
  return order.status === "DRAFT" ? "Not ordered yet" : "No delivery date";
}

/**
 * "3 of 17 received", or "Nothing received yet" before the first delivery. Only an
 * order that is out with the supplier has a delivery to count: a draft has not been
 * placed, and a received or canceled order is finished, so those say nothing (null).
 */
export function receivedLabel(status: PoStatus, receivedQty: number, orderedQty: number): string | null {
  if (status !== "ORDERED" && status !== "PARTIAL") return null;
  if (orderedQty <= 0) return "No items";
  if (receivedQty <= 0) return "Nothing received yet";
  return `${receivedQty} of ${orderedQty} received`;
}

/**
 * The one button a purchase order should wear in black.
 *
 * A draft's next step is placing it with the supplier; an order that is out
 * with the supplier (or part-delivered) next needs booking in. Anything else —
 * received, canceled, or nothing left to receive — has no next step. Receiving
 * is also *allowed* on a draft (the server permits it), but it is not the next
 * step, so it stays a quiet button there.
 */
export function nextPoAction(status: PoStatus, hasOpenLines: boolean): "order" | "receive" | null {
  if (status === "DRAFT") return "order";
  if ((status === "ORDERED" || status === "PARTIAL") && hasOpenLines) return "receive";
  return null;
}

/**
 * The tabs' counts: how many orders sit in each state, for the vendor and
 * search currently chosen. "Open" is the buyer's default view (see the list
 * page), so it is the sum of the three states that are still in play.
 */
export function poFilterCounts(rows: { status: string; count: number }[]): Record<string, number> {
  const counts: Record<string, number> = { open: 0, all: 0, DRAFT: 0, ORDERED: 0, PARTIAL: 0, RECEIVED: 0, CANCELED: 0 };
  for (const row of rows) {
    if (!(row.status in counts)) continue;
    counts[row.status] += row.count;
    counts.all += row.count;
    if (row.status === "DRAFT" || row.status === "ORDERED" || row.status === "PARTIAL") counts.open += row.count;
  }
  return counts;
}

/**
 * What one search box matches on a purchase order list: the supplier's name,
 * and the order number when the text looks like one ("1002", "#1002",
 * "PO 1002"). Returns null for an empty box so the caller adds no clause.
 */
export function purchaseOrderSearch(text: string): Prisma.PurchaseOrderWhereInput | null {
  const q = text.trim();
  if (!q) return null;
  const clauses: Prisma.PurchaseOrderWhereInput[] = [
    { vendor: { name: { contains: q, mode: "insensitive" } } },
  ];
  const number = /^(?:po\s*)?#?\s*(\d{1,9})$/i.exec(q);
  if (number) clauses.push({ number: Number.parseInt(number[1], 10) });
  return { OR: clauses };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

/** What one search box matches on a supplier: name, email, phone or account number. */
export function vendorSearch(text: string): Prisma.VendorWhereInput | null {
  const q = text.trim();
  if (!q) return null;
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { accountNumber: { contains: q, mode: "insensitive" } },
    ],
  };
}

/**
 * The quiet lines on a supplier card: how to reach them (phone, then email, then
 * the account number; at most two), or an honest "nothing yet". They stack, one
 * per line, so a long email never has to share a line with a phone number.
 */
export function vendorContactLines(vendor: {
  phone: string | null;
  email: string | null;
  accountNumber: string | null;
}): string[] {
  const parts = [vendor.phone, vendor.email, vendor.accountNumber ? `Account ${vendor.accountNumber}` : null]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.slice(0, 2) : ["No contact details yet"];
}
