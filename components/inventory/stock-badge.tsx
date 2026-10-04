import * as React from "react";

import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { STOCK_META, stockFlag, stockStatus, type StockLevel } from "./format";

/**
 * The one loud colour on a product card: how much is on the shelf.
 *
 * green in stock · amber at-or-below the reorder point · red none left ·
 * grey when the product isn't stock-tracked at all (labour, services).
 * The tones come from the app-wide set, so "low" here is the same amber as
 * "partial" on a purchase order.
 */
export function StockBadge({
  product,
  size = "md",
  className,
}: {
  product: StockLevel;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = STOCK_META[stockStatus(product)];

  return (
    <StatusPill
      tone={meta.tone}
      label={meta.label(product.stockQty)}
      className={cn(
        "tabular-nums",
        size === "sm" && "px-2 py-1 text-[12px]",
        className,
      )}
    />
  );
}

/**
 * The same state as a one-word flag ("Low" / "Out") for compact lists such as
 * the Easy-mode stock list. Items that are fine, or not stock-tracked, get none.
 */
export function StockFlag({
  product,
  size = "sm",
}: {
  product: StockLevel;
  /** `md` on a card where the flag is one of the few things to read. */
  size?: "sm" | "md";
}) {
  const flag = stockFlag(product);
  if (!flag) return null;
  return <StatusPill tone={flag.tone} label={flag.label} size={size} />;
}
