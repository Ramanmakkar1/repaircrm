"use client";

import * as React from "react";
import { PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCents } from "@/lib/money";
import { tracksStock, type PosProduct } from "./types";

const ALL = "All";
const UNCATEGORISED = "Other";

function categoryOf(product: PosProduct): string {
  return product.category?.trim() || UNCATEGORISED;
}

/** Case-insensitive exact match on either machine-readable code. */
function matchesCode(product: PosProduct, code: string): boolean {
  const lower = code.toLowerCase();
  return (
    product.upc?.trim().toLowerCase() === lower ||
    product.sku?.trim().toLowerCase() === lower
  );
}

/**
 * The left-hand half of the register: scan box, category pills, product tiles.
 *
 * The scan box is the primary input and stays focused, because a barcode
 * scanner is just a keyboard that types very fast and presses Enter. On Enter
 * we take, in order: an exact UPC/SKU match anywhere in the catalogue (so a
 * scan works even while a category filter is on), then a sole surviving search
 * result. Anything else leaves the text in place as a filter — a half-typed
 * product name should narrow the grid, not throw the input away.
 */
export function ProductGrid({
  products,
  onAdd,
  inputRef,
  scanSlot,
}: {
  products: PosProduct[];
  onAdd: (product: PosProduct) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /**
   * THE CAMERA SCAN BUTTON GOES HERE.
   *
   * These shops have no laser guns, so the phone camera is the only scanner
   * the counter gets and "scan it" has to look like the primary way to add
   * something — not a grey glyph inside a text field. The row below is built
   * for a full-height (`h-14`) button sitting to the right of the search box:
   * pass one in and it takes its own column at every width, icon-plus-word on
   * a laptop and a 56px icon square at 390px, where the words would eat the
   * search field. Nothing is rendered when the slot is empty, so the register
   * never carries a dead button while that work is still on its branch.
   */
  scanSlot?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState(ALL);
  const [miss, setMiss] = React.useState<string | null>(null);

  const categories = React.useMemo(() => {
    const seen = new Set<string>();
    for (const product of products) seen.add(categoryOf(product));
    return [ALL, ...[...seen].sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    return products.filter((product) => {
      if (category !== ALL && categoryOf(product) !== category) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.sku?.toLowerCase().includes(needle) ||
        product.upc?.toLowerCase().includes(needle)
      );
    });
  }, [products, category, needle]);

  const add = (product: PosProduct) => {
    onAdd(product);
    setQuery("");
    setMiss(null);
    inputRef.current?.focus();
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = query.trim();
    if (!code) return;

    const scanned = products.find((product) => matchesCode(product, code));
    const target = scanned ?? (visible.length === 1 ? visible[0] : null);

    if (target) {
      add(target);
      return;
    }
    // Nothing to add — keep the text as a filter and say so.
    setMiss(code);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form onSubmit={onSubmit}>
        <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <ACTIONS.search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMiss(null);
            }}
            autoFocus
            // Named as well as labelled: an unnamed field makes the browser
            // guess at autofill, and a guess in the scanner box costs a sale.
            name="pos-scan"
            autoComplete="off"
            spellCheck={false}
            aria-label="Scan a barcode or search products"
            placeholder="Scan a barcode or search products…"
            className={cn(
              // The right padding only clears the "Enter adds" hint at the widths
              // that actually render it; below `sm` the field gets the space back.
              "h-14 w-full rounded-lg border bg-surface pl-12 pr-4 text-base font-medium text-foreground shadow-sm outline-none transition-colors sm:pr-36",
              "placeholder:font-normal placeholder:text-faint-foreground",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30",
              miss
                ? "border-destructive/60 ring-2 ring-destructive/20"
                : "border-border-strong",
            )}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-[12px] font-semibold text-muted-foreground sm:inline-flex">
            <ACTIONS.scan className="size-3.5" />
            Enter adds
          </span>
        </div>
        {scanSlot}
        </div>
        {miss ? (
          <p role="status" className="mt-2 pl-1 text-[13px] font-medium text-destructive">
            Nothing in the catalogue matches “{miss}”.
          </p>
        ) : null}
      </form>

      {/* One swipeable row on a phone rather than ten pills stacked four deep —
          at 390px the wrapped version pushed the first tile below the fold. */}
      {categories.length > 2 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {categories.map((name) => {
            const active = name === category;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                aria-pressed={active}
                className={cn(
                  "h-10 shrink-0 rounded-full px-4 text-[13.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "border border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={PackageSearch}
            title={
              needle || category !== ALL
                ? "Nothing here matches"
                : "No products yet"
            }
            hint={
              needle || category !== ALL
                ? "The catalogue has products, just none under this search and category."
                : "Add products in Inventory and they will appear on the register."
            }
            action={
              needle || category !== ALL ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCategory(ALL);
                    setMiss(null);
                    inputRef.current?.focus();
                  }}
                >
                  <ACTIONS.cancel /> Show everything
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        /*
         * On a phone the tiles scroll inside their own box rather than pushing
         * the cart a thousand pixels down the page: the counter has to be able
         * to see the running total and reach a tender button without leaving
         * the first screen. On a laptop there is room for both side by side,
         * so the cap comes off.
         */
        <div className="max-h-[52vh] overflow-y-auto pr-0.5 lg:max-h-none lg:overflow-visible lg:pr-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {visible.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                onClick={() => add(product)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One big, finger-sized tile.
 *
 * Out of stock shows a red corner dot but stays fully addable: the shop floor
 * knows better than the count does, and blocking a sale over a stale number is
 * how a register loses the counter's trust. The stock decrement is still
 * written, so the discrepancy surfaces in the adjustment history instead.
 */
function ProductTile({
  product,
  onClick,
}: {
  product: PosProduct;
  onClick: () => void;
}) {
  const tracked = tracksStock(product);
  const out = tracked && product.stockQty <= 0;

  return (
    // One card surface for the whole app, including the tiles: the shared
    // `interactive` hover and the tone stripe replace the tile's own hover and
    // its corner dot, so "out of stock" is said in colour AND in words without
    // an unlabelled red pip to decode.
    <Card
      interactive
      tone={out ? "danger" : undefined}
      className="flex overflow-hidden"
    >
      <button
        type="button"
        onClick={onClick}
        title={product.sku ? `${product.name} · ${product.sku}` : product.name}
        className={cn(
          "flex min-h-[7.5rem] flex-1 flex-col justify-between gap-2 rounded-lg p-4 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">
          {product.name}
        </span>

        <span className="flex items-end justify-between gap-2">
          <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
            {formatCents(product.priceCents)}
          </span>
          {tracked ? (
            <span
              className={cn(
                "shrink-0 text-[12px] font-semibold tabular-nums",
                out ? "text-status-overdue-fg" : "text-faint-foreground",
              )}
            >
              {out ? "Out of stock" : `${product.stockQty} left`}
            </span>
          ) : null}
        </span>
      </button>
    </Card>
  );
}
