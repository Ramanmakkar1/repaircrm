"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { resolveScanAction } from "@/app/(app)/scan/actions";
import type { InventoryFilter } from "./format";

/**
 * The search half of the inventory filter bar.
 *
 * The row of `rounded-full` stock pills and the "Filters" dialog that used to
 * live here are gone: the four stock views are `FilterTabs` and the categories
 * are `FilterChips`, both rendered by the server page as plain links. A
 * category is one click now instead of open-dialog / pick / apply, and the app
 * has one filter control instead of a different one per screen.
 *
 * The URL stays the single source of truth (`?filter=&q=&category=`), so a
 * filtered view is shareable, survives the back button, and the server page
 * stays the only thing that decides what was actually queried. Current values
 * arrive as props rather than through `useSearchParams`, which keeps this out
 * of that hook's Suspense-boundary requirements.
 *
 * The camera button beside the box is a shortcut, not a second search: a code
 * that matches a product exactly goes straight to that product, because
 * somebody holding a part up to a camera wants the part, not a result list.
 * Anything else drops into the search box, where a partial match still helps.
 */
export function InventoryFilters({
  filter,
  query,
  category,
  group = "",
  easy = false,
}: {
  filter: InventoryFilter;
  query: string;
  category: string;
  group?: string;
  /** Easy mode: the search is one large 48px field, like the other list screens. */
  easy?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);
  const [pending, startTransition] = React.useTransition();

  // Re-sync the box when the committed query changes from somewhere else (the
  // back button, "Clear all", a link into a filtered view). Adjusted during
  // render rather than in an effect: React re-runs this component immediately
  // with the new value and never commits the stale one — no extra paint, and
  // no focus loss mid-typing that a `key` remount would cause.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setValue(query);
  }

  const go = React.useCallback(
    (next: { q?: string; reset?: boolean }) => {
      const params = new URLSearchParams();
      if (!next.reset) {
        if (filter !== "all") params.set("filter", filter);
        if (category) params.set("category", category);
        if (group) params.set("group", group);
      }
      const nextQuery = (next.reset ? "" : (next.q ?? value)).trim();
      if (nextQuery) params.set("q", nextQuery);
      // Any filter change resets to page 1 by simply not carrying `page` over.
      const search = params.toString();
      startTransition(() =>
        router.replace(search ? `/inventory?${search}` : "/inventory", {
          scroll: false,
        }),
      );
    },
    [category, group, filter, router, value],
  );

  // Debounced search — typing narrows the table without a round-trip per key.
  React.useEffect(() => {
    if (value.trim() === query.trim()) return;
    const timer = setTimeout(() => go({ q: value }), 250);
    return () => clearTimeout(timer);
  }, [value, query, go]);

  // "All products" is not a filter, so it does not earn a "Clear all".
  const dirty = filter !== "all" || query !== "" || category !== "" || (group !== "" && group !== "all");

  // The search box, then the slot the camera-scan button occupies. A scanned
  // SKU lands in this box, so the scan control belongs immediately to its right
  // at full field height — these shops have no laser guns and a small grey
  // glyph inside the input is not something a counter hand will find.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: value });
        }}
        className={cn("relative min-w-[240px] flex-1", easy ? "sm:max-w-xl" : "sm:max-w-sm")}
        role="search"
      >
        <ACTIONS.search className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-faint-foreground", easy ? "left-4 size-5" : "left-3 size-4")} />
        <Input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search name, SKU or UPC…"
          aria-label="Search products"
          className={easy ? "h-12 rounded-xl pl-12 pr-12 text-base" : "pl-9 pr-10"}
        />
        <div className={cn("absolute top-1/2 -translate-y-1/2", easy ? "right-2" : "right-3")}>
          {pending ? (
            <Loader2 className="size-4 animate-spin text-faint-foreground" />
          ) : value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className={cn(
                "flex items-center justify-center rounded-sm text-faint-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                easy ? "size-10 rounded-xl" : "size-5",
              )}
            >
              <ACTIONS.cancel className={easy ? "size-5" : "size-4"} />
            </button>
          ) : null}
        </div>
      </form>

      <ScanButton
        // Easy mode says "Scan" beside the icon: an unlabeled glyph is not something a counter hand finds.
        showLabel={easy}
        className={easy ? "h-12 rounded-xl px-4 text-base" : undefined}
        labelClassName={easy ? "hidden sm:inline" : undefined}
        label={easy ? "Scan" : "Scan a barcode"}
        title="Scan to find a product"
        description="A code that matches exactly opens that product."
        onScan={async (hit) => {
          const result = await resolveScanAction(hit.value);
          if (result.kind === "product") {
            startTransition(() => router.push(result.href));
            return `Opening ${result.product.name}`;
          }
          if (result.kind === "serial") {
            startTransition(() => router.push(result.href));
            return `Opening ${result.serial.productName}`;
          }
          // No exact match: leave it in the search box, where a partial match
          // on the name or a supplier's code can still find it.
          setValue(hit.value);
          go({ q: hit.value });
          return `Searching for ${hit.value}`;
        }}
      />

      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          className={easy ? "h-12 px-4 text-base" : undefined}
          onClick={() => {
            setValue("");
            go({ reset: true });
          }}
        >
          <ACTIONS.cancel /> Clear all
        </Button>
      ) : null}
    </div>
  );
}
