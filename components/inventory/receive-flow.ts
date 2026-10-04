/**
 * The rules behind "Book in delivery", kept pure so they can be tested without
 * a browser: how many of each line are being booked in, what is still in the
 * way (serial numbers not scanned yet), and what the success screen offers
 * afterwards (shelf labels for what came in, "order the rest" for what did not).
 *
 * The server (receivePurchaseOrderAction) re-checks every one of these; this is
 * only so the person sees the problem before the round trip.
 */

import { parseSerialList } from "@/lib/serials";
import { serialCountWords } from "./stock-words";

/** One line of the order, as the booking-in sheet needs it. */
export type ReceivableLine = {
  id: string;
  description: string;
  quantity: number;
  receivedQty: number;
  serialized: boolean;
  /** The catalogue product behind the line, when there is one (for its picture and its labels). */
  productId?: string | null;
  category?: string | null;
  catalogImage?: string | null;
  imageUrl?: string | null;
};

export type BookInMode = "all" | "some";

/** How many of a line the supplier still owes. */
export function stillOwed(line: Pick<ReceivableLine, "quantity" | "receivedQty">): number {
  return Math.max(0, line.quantity - line.receivedQty);
}

/** The lines with something still to come, in order. */
export function outstandingLines<T extends ReceivableLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => stillOwed(line) > 0);
}

/**
 * What gets posted for each line. "Everything arrived" books in all that is
 * owed; "Something is missing" books in what the steppers say, never more than
 * is owed and never less than nothing.
 */
export function bookInQuantities(
  lines: readonly ReceivableLine[],
  mode: BookInMode,
  counted: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of outstandingLines(lines)) {
    const owed = stillOwed(line);
    const asked = mode === "all" ? owed : Math.round(counted[line.id] ?? owed);
    out[line.id] = Math.min(owed, Math.max(0, Number.isFinite(asked) ? asked : 0));
  }
  return out;
}

/** The total number of units being booked in. */
export function bookInCount(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
}

/**
 * Why the booking cannot go yet, in plain words, or [] when it can. A
 * serialized line needs exactly one serial per unit arriving.
 */
export function bookInIssues(
  lines: readonly ReceivableLine[],
  quantities: Record<string, number>,
  serials: Record<string, string>,
): string[] {
  const issues: string[] = [];
  if (bookInCount(quantities) === 0) issues.push("Nothing to book in: set how many arrived.");
  for (const line of outstandingLines(lines)) {
    const qty = quantities[line.id] ?? 0;
    if (!line.serialized || qty === 0) continue;
    const scanned = parseSerialList(serials[line.id] ?? "").length;
    if (scanned !== qty) issues.push(`${line.description}: ${serialCountWords(scanned, qty)}. Scan one serial number per unit.`);
  }
  return issues;
}

export type BookInResult = {
  /** Units booked in. */
  items: number;
  /** One entry per product that came in, for "Print shelf labels". */
  labels: { productId: string; name: string; count: number }[];
  /** What the supplier still owes after this delivery, for "Order the rest". */
  missing: { productId: string | null; name: string; count: number }[];
};

/** What the success screen shows, computed from what was just posted. */
export function bookInResult(lines: readonly ReceivableLine[], quantities: Record<string, number>): BookInResult {
  const labels: BookInResult["labels"] = [];
  const missing: BookInResult["missing"] = [];
  let items = 0;
  for (const line of outstandingLines(lines)) {
    const qty = quantities[line.id] ?? 0;
    items += qty;
    if (qty > 0 && line.productId) labels.push({ productId: line.productId, name: line.description, count: qty });
    const left = stillOwed(line) - qty;
    if (left > 0) missing.push({ productId: line.productId ?? null, name: line.description, count: left });
  }
  return { items, labels, missing };
}

/**
 * "Order the rest": a new order with the missing catalogue items already on it
 * (`?add=productId:qty,...`). The supplier is chosen again on purpose: if the
 * first one could not send it, the rest may come from someone else.
 */
export function orderTheRestHref(missing: BookInResult["missing"]): string | null {
  const add = missing.filter((line) => line.productId).map((line) => `${line.productId}:${line.count}`);
  if (add.length === 0) return null;
  return `/inventory/purchase-orders/new?add=${encodeURIComponent(add.join(","))}`;
}
