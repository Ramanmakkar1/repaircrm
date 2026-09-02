"use client";

import * as React from "react";
import { PackageSearch, ScanLine, Search } from "lucide-react";

import { cn } from "@/components/ui/cn";
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
}: {
  products: PosProduct[];
  onAdd: (product: PosProduct) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
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
              "h-14 w-full rounded-lg border bg-surface pl-12 pr-28 text-base font-medium text-foreground shadow-sm outline-none transition-colors",
              "placeholder:font-normal placeholder:text-faint-foreground",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30",
              miss
                ? "border-destructive/60 ring-2 ring-destructive/20"
                : "border-border-strong",
            )}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-[12px] font-semibold text-muted-foreground sm:inline-flex">
            <ScanLine className="size-3.5" />
            Enter adds
          </span>
        </div>
        {miss ? (
          <p role="status" className="mt-2 pl-1 text-[13px] font-medium text-destructive">
            Nothing in the catalogue matches “{miss}”.
          </p>
        ) : null}
      </form>

      {categories.length > 2 ? (
        <div className="-mx-1 flex flex-wrap gap-2 px-1">
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
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            icon={PackageSearch}
            title="No products here"
            hint={
              needle
                ? "Nothing matches that search in this category."
                : "Add products in Inventory and they will appear on the register."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {visible.map((product) => (
            <ProductTile key={product.id} product={product} onClick={() => add(product)} />
          ))}
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
    <button
      type="button"
      onClick={onClick}
      title={product.sku ? `${product.name} · ${product.sku}` : product.name}
      className={cn(
        "rf-lift group relative flex min-h-[7.5rem] flex-col justify-between gap-2 rounded-lg border border-border bg-surface p-4 text-left shadow-sm",
        "hover:border-accent/40 hover:shadow-md active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {out ? (
        <span
          aria-hidden
          title="Out of stock"
          className="absolute right-3 top-3 size-2.5 rounded-full bg-status-overdue ring-4 ring-status-overdue-bg"
        />
      ) : null}

      <span className="line-clamp-2 pr-4 text-[14px] font-bold leading-snug text-foreground">
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
  );
}
