import type { StatusTone } from "@/components/ui/badge";

/**
 * Presentation rules shared by every Inventory view.
 *
 * Lives outside `actions.ts` because a `"use server"` module may only export
 * async functions — these constants and pure helpers are needed by the list
 * page, the detail page, the cards and the label sheet alike.
 */

export type StockLevel = {
  stockQty: number;
  /** Reorder point; null means this product isn't stock-tracked. */
  lowStockAt: number | null;
};

/**
 * The four states a product's stock can be in. ONE rule, used by the badge,
 * the filter pills and the low-stock banner so they can never disagree:
 *
 *   untracked  no reorder point AND nothing on hand  → labour/services
 *   out        nothing on hand (and it is tracked)
 *   low        on hand, but at or below the reorder point
 *   in         everything else
 */
export type StockStatus = "in" | "low" | "out" | "untracked";

export function stockStatus({ stockQty, lowStockAt }: StockLevel): StockStatus {
  if (lowStockAt == null && stockQty <= 0) return "untracked";
  if (stockQty <= 0) return "out";
  if (lowStockAt != null && stockQty <= lowStockAt) return "low";
  return "in";
}

export const STOCK_META: Record<
  StockStatus,
  { label: (qty: number) => string; tone: StatusTone; text: string }
> = {
  in: {
    label: (qty) => `${qty} in stock`,
    tone: "success",
    text: "text-status-resolved-fg",
  },
  low: {
    label: (qty) => `Low · ${qty} left`,
    tone: "active",
    text: "text-status-in-progress-fg",
  },
  out: {
    label: () => "Out of stock",
    tone: "danger",
    text: "text-status-overdue-fg",
  },
  untracked: {
    label: () => "Not stocked",
    tone: "neutral",
    text: "text-muted-foreground",
  },
};

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export const FILTERS = ["all", "low", "out", "inactive"] as const;
export type InventoryFilter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<InventoryFilter, string> = {
  all: "All",
  low: "Low stock",
  out: "Out of stock",
  inactive: "Inactive",
};

export function asFilter(value: string | undefined): InventoryFilter {
  return (FILTERS as readonly string[]).includes(value ?? "")
    ? (value as InventoryFilter)
    : "all";
}

// ---------------------------------------------------------------------------
// Stock adjustments
// ---------------------------------------------------------------------------

/**
 * The reasons a stock level moves. Free text would make the audit trail
 * un-groupable, so the reason is a fixed vocabulary and anything extra goes in
 * the note (see `composeReason`).
 */
export const STOCK_REASONS = [
  "Received",
  "Sold",
  "Damaged",
  "Counted",
  "Other",
] as const;

export type StockReason = (typeof STOCK_REASONS)[number];

export function isStockReason(value: string): value is StockReason {
  return (STOCK_REASONS as readonly string[]).includes(value);
}

/**
 * The kind of move, in the app-wide tone language: stock arriving is green,
 * stock leaving on an invoice is blue, a write-off is red, and a stock-take or
 * anything else is grey. Same seven tones as every other status in the app, so
 * "Received" here is the same green as a received purchase order.
 */
export const STOCK_REASON_META: Record<StockReason, { tone: StatusTone }> = {
  Received: { tone: "success" },
  Sold: { tone: "info" },
  Damaged: { tone: "danger" },
  Counted: { tone: "neutral" },
  Other: { tone: "neutral" },
};

/**
 * The inverse of `composeReason`: pulls the typed kind back off the front of a
 * stored reason so the table can show it as a pill and the operator's own words
 * as text. A row written before the vocabulary existed has no known kind and
 * travels entirely as the note.
 */
export function splitReason(reason: string): {
  kind: StockReason | null;
  note: string;
} {
  const [head, ...rest] = reason.split(" — ");
  if (head && isStockReason(head)) {
    return { kind: head, note: rest.join(" — ") };
  }
  return { kind: null, note: reason };
}

/**
 * StockAdjustment has one `reason` column and no note column, so a typed
 * reason and its free-text note are stored as `Received — 2 boxes from Mobilesentrix`.
 */
export function composeReason(reason: string, note?: string | null): string {
  const trimmed = (note ?? "").trim();
  return trimmed ? `${reason} — ${trimmed}` : reason;
}

/** "+5" / "−1" — a real minus sign, and never a bare "0". */
export function signedQty(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

export function deltaClass(delta: number): string {
  if (delta > 0) return "text-status-resolved-fg";
  if (delta < 0) return "text-status-overdue-fg";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Money / identity
// ---------------------------------------------------------------------------

/** Gross margin as a whole percentage, or null when it can't be computed. */
export function marginPct(
  priceCents: number,
  costCents: number | null | undefined,
): number | null {
  if (costCents == null || priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 100);
}

/**
 * What a scanner should read off a label: the SKU a shop actually uses, then
 * the manufacturer's UPC, then the row id so a label is never blank.
 */
export function barcodeValue(product: {
  id: string;
  sku?: string | null;
  upc?: string | null;
}): string {
  return product.sku?.trim() || product.upc?.trim() || product.id;
}

export const MIN_LABELS = 1;
export const MAX_LABELS = 30;
export const DEFAULT_LABELS = 10;

export function clampLabelCount(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_LABELS;
  return Math.min(MAX_LABELS, Math.max(MIN_LABELS, n));
}
