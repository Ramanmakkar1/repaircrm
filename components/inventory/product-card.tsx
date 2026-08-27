import Link from "next/link";
import { Barcode, EyeOff, Tag } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import { marginPct } from "./format";
import { StockBadge } from "./stock-badge";

export type ProductCardData = {
  id: string;
  name: string;
  sku: string | null;
  upc: string | null;
  category: string | null;
  priceCents: number;
  costCents: number | null;
  stockQty: number;
  lowStockAt: number | null;
  active: boolean;
};

/**
 * One part as a single tappable box.
 *
 * The eye lands in a fixed order every time: name, then price, then the stock
 * badge — the three things somebody standing at the counter with a customer
 * actually needs. Identifiers stay small and monospaced so a scanned SKU is
 * easy to match by eye; margin is owner-only and quietest of all.
 *
 * A plain server-rendered <Link> wraps the card: no client JS, and
 * middle-click / open-in-new-tab / copy-link all behave.
 */
export function ProductCard({
  product,
  showCost,
  className,
}: {
  product: ProductCardData;
  /** Cost and margin are commercially sensitive — OWNER only. */
  showCost: boolean;
  className?: string;
}) {
  const margin = marginPct(product.priceCents, product.costCents);

  return (
    <Link
      href={`/inventory/${product.id}`}
      className={cn(
        "rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        !product.active && "border-dashed bg-surface-hover/40",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <span
          className={cn(
            "line-clamp-2 text-[17px] font-bold leading-snug text-foreground",
            !product.active && "text-muted-foreground",
          )}
        >
          {product.name}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {product.category ? (
            <Chip icon={Tag}>{product.category}</Chip>
          ) : (
            <Chip className="text-faint-foreground">Uncategorised</Chip>
          )}
          {!product.active ? (
            <Chip
              icon={EyeOff}
              className="bg-surface-hover font-semibold text-faint-foreground"
            >
              Inactive
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-[12.5px] font-medium text-faint-foreground">
        <span className="flex items-center gap-1.5">
          <Barcode className="size-3.5 shrink-0" />
          <span className="truncate font-mono">
            {product.sku ?? "No SKU"}
            {product.upc ? ` · ${product.upc}` : ""}
          </span>
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
            {formatCents(product.priceCents)}
          </span>
          {showCost ? (
            <span className="truncate text-[12.5px] font-medium text-muted-foreground tabular-nums">
              {product.costCents == null
                ? "No cost on file"
                : `Cost ${formatCents(product.costCents)}${
                    margin == null ? "" : ` · ${margin}% margin`
                  }`}
            </span>
          ) : null}
        </div>
        <StockBadge product={product} className="mb-0.5 shrink-0" />
      </div>
    </Link>
  );
}
