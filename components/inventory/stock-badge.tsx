import * as React from "react";

import { cn } from "@/components/ui/cn";
import { STOCK_META, stockStatus, type StockLevel } from "./format";

/**
 * The one loud colour on a product card: how much is on the shelf.
 *
 * green in stock · amber at-or-below the reorder point · red none left ·
 * grey when the product isn't stock-tracked at all (labour, services).
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
  const status = stockStatus(product);
  const meta = STOCK_META[status];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full font-semibold leading-none tabular-nums",
        size === "sm" ? "px-2 py-1 text-[12px]" : "px-2.5 py-1 text-[12.5px]",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
      {meta.label(product.stockQty)}
    </span>
  );
}
