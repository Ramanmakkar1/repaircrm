"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, LayoutGrid, Package, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { looksLikeUpc } from "@/lib/scan/codes";
import { formatCents } from "@/lib/money";
import { ProductImage } from "@/components/inventory/product-image";
import { groupPhoto, inventoryGroup } from "@/lib/inventory/groups";
import { productImageSource } from "@/lib/inventory/product-images";
import { itemsLabel } from "./terminal-logic";
import { tracksStock, type PosProduct } from "./types";

const ALL = "all";
/** null = show the category boxes ("What are you selling?"). */
type Shelf = string | null;

/** Case-insensitive exact match on either machine-readable code. */
function matchesCode(product: PosProduct, code: string): boolean {
  const lower = code.toLowerCase();
  return (
    product.upc?.trim().toLowerCase() === lower ||
    product.sku?.trim().toLowerCase() === lower
  );
}

/**
 * Where keyboard focus goes after the register swaps between the shelf boxes
 * and the item grid. Tapping a box (or "All categories") removes the very
 * button that had focus, so focus falls onto <body> and a scanner would type
 * into nothing — the scan box is the only scan path on /pos. Only a lost focus
 * is repaired: if the user is in another field, it stays where they put it.
 */
export function focusAfterShelfChange(
  from: Shelf,
  to: Shelf,
  focusIsLost: boolean,
): "scan" | "shelves" | null {
  if (from === to || !focusIsLost) return null;
  return to === null ? "shelves" : "scan";
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
 *
 * The camera button beside it is the same thing for a shop with no gun: it
 * stays open in continuous mode, so scanning five boxes puts five lines in the
 * cart without anyone touching the screen. It hides itself on a machine with no
 * camera (see components/scan/scan-button.tsx) — that till uses the phone
 * instead, from the button in the cart panel's header.
 */
export function ProductGrid({
  products,
  onAdd,
  inputRef,
  scanSlot,
  layout = "classic",
}: {
  products: PosProduct[];
  onAdd: (product: PosProduct) => void;
  /**
   * Handles a scanned code — from the camera or a paired phone. `message` is
   * the one line to show for it ("Added iPhone 14 Case", or why not); `matched`
   * is false when nothing in the shop answers to that code, which is what puts
   * the "create a product for it" shortcut on screen.
   */
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
  /**
   * `terminal` is the one-screen register: a big search bar, denser picture
   * boxes (four across on a tablet) and, from `lg`, a column that fills the
   * height it is given and scrolls only the boxes. `classic` is the layout
   * Full mode keeps.
   */
  layout?: "classic" | "terminal";
}) {
  const terminal = layout === "terminal";
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<Shelf>(null);
  const [miss, setMiss] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState("name");

  // Shelf boxes: the same recognisable groups as Stock (Screen guards, Batteries,
  // Cables & chargers…), each with a photo, so staff pick by sight.
  const shelves = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; first: PosProduct }>();
    for (const product of products) {
      const { key, label } = inventoryGroup(product);
      const shelf = map.get(key) ?? { key, label, count: 0, first: product };
      shelf.count++;
      map.set(key, shelf);
    }
    const priority = ["screen-guards", "charging", "batteries", "screens", "ports"];
    const order = (key: string) => (priority.includes(key) ? priority.indexOf(key) : priority.length);
    return [...map.values()].sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label));
  }, [products]);
  const shelfLabel = category === ALL ? "All products" : shelves.find((shelf) => shelf.key === category)?.label;

  // Not on first mount: only a change of shelf moves focus (see above).
  const shownShelf = React.useRef(category);
  const shelvesHeading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    const active = document.activeElement;
    const target = focusAfterShelfChange(shownShelf.current, category, !active || active === document.body);
    shownShelf.current = category;
    // On a touch-only device (no mouse or keyboard) focusing the scan box would raise the
    // on-screen keyboard over the shelf that was just opened, so leave focus alone there.
    const touchOnly = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
    if (target === "scan") { if (!touchOnly) inputRef.current?.focus({ preventScroll: true }); }
    else if (target === "shelves") shelvesHeading.current?.focus({ preventScroll: true });
  }, [category, inputRef]);

  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    const filtered = products.filter((product) => {
      // A search always looks through everything, whichever shelf is open.
      if (!needle) return category === ALL || inventoryGroup(product).key === category;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.sku?.toLowerCase().includes(needle) ||
        product.upc?.toLowerCase().includes(needle) ||
        product.category?.toLowerCase().includes(needle)
      );
    });
    return filtered.sort((a, b) => {
      if (sort === "price-asc") return a.priceCents - b.priceCents || a.name.localeCompare(b.name);
      if (sort === "price-desc") return b.priceCents - a.priceCents || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [products, category, needle, sort]);

  const add = (product: PosProduct) => {
    onAdd(product);
    setQuery("");
    setMiss(null);
    inputRef.current?.focus({ preventScroll: true });
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

  const showShelves = category === null && !needle;
  const showBack = category !== null && !needle;
  const gridClass = terminal
    ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-2.5 xl:grid-cols-5"
    : "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 xl:gap-4";

  const sortSelect = (
    <label className="flex items-center gap-2">
      Sort by
      <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <option value="name">Name</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
    </label>
  );

  return (
    <div className={cn("flex min-w-0 flex-col", terminal ? "gap-3 lg:min-h-0 lg:flex-1" : "gap-4")}>
      <form onSubmit={onSubmit} className={terminal ? "shrink-0" : undefined}>
        <div className={cn("flex gap-2", terminal ? "items-stretch" : "items-start")}>
        <div className="relative min-w-0 flex-1">
          <ACTIONS.search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMiss(null);
            }}
            // Named as well as labelled: an unnamed field makes the browser
            // guess at autofill, and a guess in the scanner box costs a sale.
            name="pos-scan"
            autoComplete="off"
            spellCheck={false}
            aria-label="Scan a barcode or search products"
            placeholder={terminal ? "Scan or search products…" : "Scan a barcode or search products…"}
            className={cn(
              // The right padding only clears the "Enter adds" hint at the widths
              // that actually render it; below `sm` the field gets the space back.
              terminal
                ? "h-14 w-full rounded-xl border bg-surface pl-12 pr-4 text-base font-medium text-foreground outline-none transition-colors sm:pr-32 lg:pr-4 xl:pr-32"
                : "h-11 w-full rounded-lg border bg-surface pl-12 pr-4 text-sm font-medium text-foreground outline-none transition-colors sm:pr-32",
              "placeholder:font-normal placeholder:text-muted-foreground",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30",
              miss
                ? "border-destructive/60 ring-2 ring-destructive/20"
                : "border-border-strong",
            )}
          />
          <span className={cn("pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-md bg-surface-hover px-2 py-1 text-[12px] font-semibold text-muted-foreground sm:inline-flex", terminal && "lg:hidden xl:inline-flex")}>
            <ACTIONS.scan className="size-3.5" />
            Enter adds
          </span>
        </div>
        {scanSlot}
        </div>
        {miss ? (
          <p
            role="status"
            className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[13px] font-medium text-destructive", terminal && "pt-2")}
          >
            No product matches “{miss}”.
            {/* The shortcut that turns a dead end into a task: a code that
                scanned cleanly but is not in the catalogue almost always means
                the product has not been added yet. */}
            <Link
              href={`/inventory/new?${looksLikeUpc(miss) ? "upc" : "sku"}=${encodeURIComponent(miss)}`}
              className="inline-flex items-center gap-1 font-semibold text-accent-soft-foreground underline-offset-2 hover:underline"
            >
              <ACTIONS.add className="size-3.5" />
              Create product with this {looksLikeUpc(miss) ? "UPC" : "code"}
            </Link>
          </p>
        ) : null}
      </form>

      {showBack && !terminal ? (
        <button
          type="button"
          onClick={() => setCategory(null)}
          className="flex min-h-12 items-center gap-2 self-start rounded-xl border border-border bg-surface px-4 text-base font-semibold hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden /> All categories
          <span className="font-normal text-muted-foreground">· {shelfLabel}</span>
        </button>
      ) : null}

      {/* The one-screen register keeps "back", the count and the sort in a
          single row that stays put while the boxes below it scroll. */}
      {terminal && !showShelves ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showBack ? (
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface pl-2.5 pr-3.5 text-[15px] font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-5" aria-hidden /> All categories
            </button>
          ) : null}
          {/* On a phone the count drops under the back button and the sort. */}
          <span aria-live="polite" className="order-last w-full min-w-0 truncate text-[13px] sm:order-none sm:w-auto sm:flex-1">
            {showBack ? <span className="font-semibold text-foreground">{shelfLabel} · </span> : null}
            {visible.length} {visible.length === 1 ? "product" : "products"}
          </span>
          <span className="ml-auto">{sortSelect}</span>
        </div>
      ) : null}

      <div className={terminal ? "flex min-h-0 flex-col gap-3 lg:-m-1 lg:flex-1 lg:overflow-y-auto lg:p-1" : "contents"}>
      {showShelves ? (
        <section aria-label="What are you selling?" className="flex flex-col gap-3">
          <h2 ref={shelvesHeading} tabIndex={-1} className="text-lg font-semibold outline-none">What are you selling?</h2>
          <div className={gridClass}>
            {shelves.map((shelf) => {
              const photo = groupPhoto(shelf.key, shelf.label, () => productImageSource({ name: shelf.first.name, category: shelf.first.category, catalogImage: shelf.first.catalogImage }).src ?? null);
              return (
                <ShelfBox key={shelf.key} compact={terminal} label={shelf.label} detail={itemsLabel(shelf.count)} photo={photo} onClick={() => setCategory(shelf.key)} />
              );
            })}
            <ShelfBox compact={terminal} label="All products" detail={`${products.length} items`} onClick={() => setCategory(ALL)} />
          </div>
        </section>
      ) : null}

      {showShelves ? null : <>
      {terminal ? null : (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">{visible.length} {visible.length === 1 ? "product" : "products"}</span>
        {sortSelect}
      </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={PackageSearch}
            title={
              needle || (category !== ALL && category !== null)
                ? "Nothing here matches"
                : "No products yet"
            }
            hint={
              needle || (category !== ALL && category !== null)
                ? "The catalogue has products, just none under this search and category."
                : "Add products in Inventory and they will appear on the register."
            }
            action={
              needle || (category !== ALL && category !== null) ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                    setMiss(null);
                    inputRef.current?.focus();
                  }}
                >
                  <ACTIONS.cancel /> Show everything
                </Button>
              ) : <Button asChild variant="outline"><Link href="/inventory/new"><ACTIONS.add /> Add your first product</Link></Button>
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
          <div className={gridClass}>
            {visible.map((product) => terminal ? (
              <CompactProductTile
                key={product.id}
                product={product}
                onClick={() => add(product)}
              />
            ) : (
              <ProductTile
                key={product.id}
                product={product}
                onClick={() => add(product)}
              />
            ))}
          </div>
        </div>
      )}
      </>}
      </div>
    </div>
  );
}

/** A category box on the register's first screen: big photo, plain name, item count. */
function ShelfBox({ label, detail, photo, onClick, compact = false }: { label: string; detail: string; photo?: string | null; onClick: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-12 flex-col gap-1.5 rounded-2xl border border-border bg-surface p-1.5 text-left transition-[border-color,transform] hover:border-ring active:scale-[0.98] active:bg-surface-hover motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Product photos are shot on white, so a photo sits on a white canvas in every theme. */}
        <span className={cn("relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl", photo ? "bg-white" : "bg-surface-hover")}>
          {photo ? <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, 160px" className="object-contain p-1.5" />
            : label === "All products" ? <LayoutGrid className="size-8 text-muted-foreground" aria-hidden /> : <Package className="size-8 text-muted-foreground" aria-hidden />}
        </span>
        <span className="px-1.5 pb-1">
          <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.15]">{label}</span>
          <span className="block text-[13px] leading-snug text-muted-foreground">{detail}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-ring active:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative flex aspect-[3/2] items-center justify-center overflow-hidden rounded-xl bg-surface-hover">
        {photo ? <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, 220px" className="object-contain p-3" />
          : label === "All products" ? <LayoutGrid className="size-10 text-muted-foreground" aria-hidden /> : <Package className="size-10 text-muted-foreground" aria-hidden />}
      </span>
      <span className="px-1 pb-1">
        <span className="block text-base font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

/**
 * The dense tile for the one-screen register: a smaller picture, the name, the
 * price and the stock in words. The whole tile is the button; the round plus is
 * only there to say "tap to add". Out of stock is a word in a pill (never a
 * coloured edge) and the tile stays addable, for the reasons given on
 * `ProductTile`.
 */
function CompactProductTile({ product, onClick }: { product: PosProduct; onClick: () => void }) {
  const tracked = tracksStock(product);
  const out = tracked && product.stockQty <= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Add ${product.name} to sale`}
      title={product.sku ? `${product.name} · ${product.sku}` : product.name}
      className={cn(
        "group flex min-h-12 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left",
        "transition-[border-color,transform] hover:border-ring active:scale-[0.98] active:bg-surface-hover motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="relative block">
        <ProductImage productId={product.id} name={product.name} category={product.category} catalogImage={product.catalogImage} imageUrl={product.imageUrl} className="aspect-[3/2] w-full rounded-none bg-white p-1" sizes="(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 160px" />
        <span aria-hidden className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full border border-border-strong bg-accent text-accent-foreground shadow-sm">
          <ACTIONS.add className="size-4" />
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 min-h-[2.5rem] text-[14px] font-semibold leading-5 text-foreground">{product.name}</span>
        <span className="text-base font-bold tabular-nums tracking-tight text-foreground">{formatCents(product.priceCents)}</span>
        {tracked ? (
          <span
            className={cn(
              "w-fit text-[12px] font-semibold tabular-nums",
              out ? "rounded-md bg-status-overdue-bg px-1.5 py-0.5 text-status-overdue-fg" : "text-status-resolved-fg",
            )}
          >
            {out ? "Out of stock" : `${product.stockQty} in stock`}
          </span>
        ) : null}
      </span>
    </button>
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
      className="flex overflow-hidden shadow-none hover:shadow-none"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add ${product.name} to sale`}
        title={product.sku ? `${product.name} · ${product.sku}` : product.name}
        className={cn(
          "group flex min-w-0 flex-1 flex-col rounded-lg text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <ProductImage productId={product.id} name={product.name} category={product.category} catalogImage={product.catalogImage} imageUrl={product.imageUrl} className="aspect-[1.5] w-full rounded-none bg-white p-3 sm:p-4" sizes="(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 300px" showFallbackLabel />
        <span className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
          {product.name}
        </span>

        <span className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-base font-semibold tabular-nums tracking-tight text-foreground sm:text-lg">
            {formatCents(product.priceCents)}
          </span>
          {tracked ? (
            <span
              className={cn(
                "shrink-0 text-[12px] font-semibold tabular-nums",
                out ? "text-status-overdue-fg" : "text-status-resolved-fg",
              )}
            >
              {out ? "Out of stock" : `${product.stockQty} in stock`}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="mt-1 flex min-h-10 items-center justify-center gap-1 rounded-md border border-border bg-surface text-[13px] font-medium text-foreground transition-colors group-hover:bg-surface-hover"><ACTIONS.add className="size-3.5" /> Add to sale</span>
        </span>
      </button>
    </Card>
  );
}
