"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, LayoutGrid, Link2, Package, PackageSearch, Plus, Tag } from "lucide-react";

import { ProductImage } from "@/components/inventory/product-image";
import { ScanButton } from "@/components/scan/scan-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { IssueLines, NextButton } from "@/components/tickets/intake/tiles";
import { groupPhoto } from "@/lib/inventory/groups";
import { productImageSource } from "@/lib/inventory/product-images";
import { formatCents } from "@/lib/money";
import type { ProductOption } from "../types";
import {
  ALL_SHELF,
  filterProducts,
  itemsLabel,
  matchProductCode,
  productQuantity,
  repairLabel,
  repairOf,
  repairsFor,
  shelvesOf,
  type BillContext,
  type BillState,
  type Issue,
} from "./flow";

/** More than this on one shelf is a search job, not a looking job. */
const SHOWN = 120;

/**
 * Step 2: what are you billing. The Sell screen's picture shelves, the same
 * way round: a big search/scan box, the shelves as picture boxes, then the
 * products on a shelf as picture tiles. Tap one to add it; tap again for one
 * more (the tile says how many are on the bill). "One-off item" is for what is
 * not in the catalogue; "From repair" appears when this customer has an open
 * repair.
 */
export function ItemsStep({
  state,
  ctx,
  onPick,
  onCode,
  onOneOff,
  onRepair,
  onNext,
  issues,
  status,
}: {
  state: BillState;
  ctx: BillContext;
  /** A product tile was tapped. */
  onPick: (product: ProductOption) => void;
  /** A typed or scanned code that is not a SKU on this list: the server looks it up. */
  onCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  onOneOff: () => void;
  onRepair: () => void;
  onNext: () => void;
  issues: Issue[];
  /** What the last tap did, in words ("Added Screen guard"). */
  status: string;
}) {
  const [query, setQuery] = React.useState("");
  const [shelf, setShelf] = React.useState<string | null>(null);
  const [miss, setMiss] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // A mouse and keyboard (a barcode gun is a keyboard) keep the cursor in the scan box: the app-wide
  // gun router only stands back while a field has focus, and a tapped tile or shelf is not a field. A
  // touch screen does not, or the on-screen keyboard would cover the shelves.
  const focusScan = React.useCallback(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => {
    const frame = requestAnimationFrame(focusScan);
    return () => cancelAnimationFrame(frame);
  }, [shelf, focusScan]);

  const shelves = React.useMemo(() => shelvesOf(ctx.products), [ctx.products]);
  const shelfLabel = shelf === ALL_SHELF ? "All products" : shelves.find((item) => item.key === shelf)?.label;
  const visible = React.useMemo(() => filterProducts(ctx.products, { shelf, query }), [ctx.products, shelf, query]);
  const needle = query.trim();
  const showShelves = shelf === null && !needle;
  const showBack = shelf !== null && !needle;

  const repairs = repairsFor(state, ctx);
  const linked = repairOf(state, ctx);
  const showRepair = repairs.length > 0 || linked !== null;
  const messages = issues.filter((issue) => issue.step === 1).map((issue) => issue.message);

  const add = (product: ProductOption) => {
    onPick(product);
    setQuery("");
    setMiss(null);
    focusScan();
  };

  async function onEnter() {
    const code = query.trim();
    if (!code || busy) return;
    // A SKU or the one product left on screen is added at once; any other code is a barcode or a unit's serial, so the server looks it up.
    const local = matchProductCode(ctx.products, code) ?? (visible.length === 1 ? visible[0] : null);
    if (local) return add(local);
    setBusy(true);
    const result = await onCode(code);
    setBusy(false);
    if (result.ok) {
      setQuery("");
      setMiss(null);
    } else {
      setMiss(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={messages} />

      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <ACTIONS.search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMiss(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void onEnter();
            }}
            // Named as well as labelled: an unnamed field makes the browser guess at autofill, and a guess in the scanner box costs a document.
            name="bill-scan"
            autoComplete="off"
            spellCheck={false}
            aria-label="Scan a barcode or search products"
            placeholder="Scan or search products…"
            className={cn(
              "h-14 w-full rounded-xl border bg-surface pl-12 pr-4 text-base font-medium text-foreground outline-none transition-colors",
              "placeholder:font-normal placeholder:text-muted-foreground",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30",
              miss ? "border-destructive/60 ring-2 ring-destructive/20" : "border-border-strong",
            )}
          />
        </div>
        <ScanButton
          continuous
          showLabel
          variant="outline"
          size="lg"
          className="h-14 shrink-0 gap-2 rounded-xl px-4 sm:px-5"
          labelClassName="hidden sm:inline"
          label="Scan barcode"
          title="Scan to add an item"
          description="Every code adds an item at the price on file. Keep scanning until you are done."
          onScan={async (hit) => (await onCode(hit.value)).message}
        />
      </div>
      {/* What the last tap did (or why a code found nothing), for a screen reader; sighted people see it on the tile and in the panel. */}
      <p role="status" aria-live="polite" className="sr-only">{miss ?? status}</p>
      {miss ? <p aria-hidden className="-mt-2 pl-1 text-[13px] font-medium text-destructive">{miss}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {showBack ? (
          <button
            type="button"
            onClick={() => setShelf(null)}
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface pl-2.5 pr-3.5 text-[15px] font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-full"
          >
            <ChevronLeft className="size-5" aria-hidden /> All categories
          </button>
        ) : null}
        <Button type="button" variant="outline" className="h-12 min-w-0 flex-1 px-3 text-[15px]" onClick={onOneOff}>
          <Plus aria-hidden />
          One-off item
        </Button>
        {showRepair ? (
          <Button type="button" variant="outline" className="h-12 min-w-0 flex-1 px-3 text-[15px]" onClick={onRepair}>
            <Link2 aria-hidden />
            <span className="truncate">{linked ? `Repair #${linked.number}` : "From repair"}</span>
          </Button>
        ) : null}
      </div>

      {linked ? (
        <p className="-mt-1 flex items-center gap-2 px-1 text-[14px] text-muted-foreground">
          <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />
          Linked to {repairLabel(linked)}
        </p>
      ) : null}

      {ctx.products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
          <PackageSearch aria-hidden className="size-8 text-faint-foreground" />
          <p className="text-base font-semibold">No products yet</p>
          <p className="text-sm text-muted-foreground">Use One-off item for now, or add your products and they will show up here as pictures.</p>
          <Button asChild variant="outline" className="h-12">
            <Link href="/inventory/new"><ACTIONS.add /> Add your first product</Link>
          </Button>
        </div>
      ) : showShelves ? (
        <section aria-label="Categories" className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Pick a shelf</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shelves.map((item) => (
              <ShelfBox
                key={item.key}
                label={item.label}
                detail={itemsLabel(item.count)}
                photo={groupPhoto(item.key, item.label, () => productImageSource({ name: item.first.name, category: item.first.category }).src ?? null)}
                onClick={() => setShelf(item.key)}
              />
            ))}
            <ShelfBox label="All products" detail={`${ctx.products.length} items`} onClick={() => setShelf(ALL_SHELF)} />
          </div>
        </section>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
          <PackageSearch aria-hidden className="size-8 text-faint-foreground" />
          <p className="text-base font-semibold">Nothing here matches</p>
          <p className="text-sm text-muted-foreground">Try another word, or use One-off item for something that is not in the catalogue.</p>
          <Button type="button" variant="outline" className="h-12" onClick={() => { setQuery(""); setShelf(null); setMiss(null); }}>Show everything</Button>
        </div>
      ) : (
        <section aria-label={shelfLabel ?? "Search results"} className="flex flex-col gap-3">
          <p aria-live="polite" className="text-[13px] text-muted-foreground">
            {needle ? <span className="font-semibold text-foreground">Search · </span> : null}
            {showBack ? <span className="font-semibold text-foreground">{shelfLabel} · </span> : null}
            {visible.length} {visible.length === 1 ? "product" : "products"}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.slice(0, SHOWN).map((product) => (
              <ProductTile key={product.id} product={product} count={productQuantity(state, product.id)} bySerial={ctx.kind === "invoice"} onClick={() => add(product)} />
            ))}
          </div>
          {visible.length > SHOWN ? <p className="text-sm text-muted-foreground">Showing the first {SHOWN}. Search to find the rest.</p> : null}
        </section>
      )}

      <NextButton onClick={onNext}>Next: Review</NextButton>
    </div>
  );
}

/** A shelf box on the first screen: big photo, plain name, how many items. Photos are shot on white, so the picture sits on a white canvas in every theme. */
export function ShelfBox({ label, detail, photo, onClick }: { label: string; detail: string; photo?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 flex-col gap-1.5 rounded-2xl border border-border bg-surface p-1.5 text-left transition-[border-color,transform] hover:border-ring active:scale-[0.98] active:bg-surface-hover motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl", photo ? "bg-white" : "bg-surface-hover")}>
        {photo ? (
          <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, 160px" className="object-contain p-1.5" />
        ) : label === "All products" ? (
          <LayoutGrid className="size-8 text-muted-foreground" aria-hidden />
        ) : (
          <Package className="size-8 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="px-1.5 pb-1">
        <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.15]">{label}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

/**
 * A product as a picture tile: photo, name, price. The whole tile is the
 * button. Once it is on the bill it says how many ("2 added"): in words, with a
 * tick, and a full accent border, never a coloured edge.
 */
export function ProductTile({ product, count, onClick, bySerial = false }: { product: ProductOption; count: number; onClick: () => void; /** An invoice sells a serialized product one unit at a time: the tile says so. */ bySerial?: boolean }) {
  const added = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={added ? `Add another ${product.name} (${count} on this bill)` : `Add ${product.name}`}
      title={product.sku ? `${product.name} · ${product.sku}` : product.name}
      className={cn(
        "group flex min-h-12 min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface text-left",
        "transition-[border-color,transform] active:scale-[0.98] active:bg-surface-hover motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        added ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
      )}
    >
      <span className="relative block">
        <ProductImage
          productId={product.id}
          name={product.name}
          category={product.category}
          imageUrl={product.imageUrl}
          className="aspect-[3/2] w-full rounded-none bg-white p-1"
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 160px"
        />
        {added ? (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[13px] font-semibold tabular-nums text-accent-foreground shadow-sm">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
            {count} added
          </span>
        ) : null}
        <span aria-hidden className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full border border-border-strong bg-accent text-accent-foreground shadow-sm">
          <ACTIONS.add className="size-4" />
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 min-h-[2.5rem] text-[14px] font-semibold leading-5 text-foreground">{product.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-base font-bold tabular-nums tracking-tight text-foreground">{formatCents(product.priceCents)}</span>
          {bySerial && product.serialized ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground"><Tag aria-hidden className="size-3" />By serial</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
