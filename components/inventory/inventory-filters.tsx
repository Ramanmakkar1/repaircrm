"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveScanAction } from "@/app/(app)/scan/actions";
import { FILTERS, FILTER_LABELS, type InventoryFilter } from "./format";

const ANY_CATEGORY = "__any__";

/**
 * One row of pills for the four stock views, one search box, and everything
 * else behind a "Filters" dialog.
 *
 * The URL is the single source of truth (`?filter=&q=&category=`), so a
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
  categories,
}: {
  filter: InventoryFilter;
  query: string;
  category: string;
  /** Distinct categories that actually exist in this shop. */
  categories: readonly string[];
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [draftCategory, setDraftCategory] = React.useState(category || ANY_CATEGORY);

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
    (next: { filter?: InventoryFilter; q?: string; category?: string }) => {
      const params = new URLSearchParams();
      const nextFilter = next.filter ?? filter;
      const nextQuery = (next.q ?? value).trim();
      const nextCategory = next.category ?? category;

      if (nextFilter !== "all") params.set("filter", nextFilter);
      if (nextQuery) params.set("q", nextQuery);
      if (nextCategory) params.set("category", nextCategory);
      // Any filter change resets to page 1 by simply not carrying `page` over.
      const search = params.toString();
      startTransition(() =>
        router.replace(search ? `/inventory?${search}` : "/inventory", {
          scroll: false,
        }),
      );
    },
    [category, filter, router, value],
  );

  // Debounced search — typing narrows the grid without a round-trip per key.
  React.useEffect(() => {
    if (value.trim() === query.trim()) return;
    const timer = setTimeout(() => go({ q: value }), 250);
    return () => clearTimeout(timer);
  }, [value, query, go]);

  const dirty = filter !== "all" || query !== "" || category !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => go({ filter: key })}
              aria-pressed={active}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                  : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {FILTER_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* The search box, then the slot the camera-scan button occupies, then
          the filter controls. A scanned SKU lands in this box, so the scan
          control belongs immediately to its right at full field height — these
          shops have no laser guns and a small grey glyph inside the input is
          not something a counter hand will find. */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go({ q: value });
          }}
          className="relative min-w-[240px] flex-1 sm:max-w-sm"
          role="search"
        >
          <ACTIONS.search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
          <Input
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search name, SKU or UPC…"
            aria-label="Search products"
            className="pl-11 pr-11"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {pending ? (
              <Loader2 className="size-[18px] animate-spin text-faint-foreground" />
            ) : value ? (
              <button
                type="button"
                onClick={() => setValue("")}
                aria-label="Clear search"
                className="flex size-5 items-center justify-center rounded-full text-faint-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <ACTIONS.cancel className="size-[18px]" />
              </button>
            ) : null}
          </div>
        </form>

        <ScanButton
          label="Scan a barcode"
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
            // No exact match: leave it in the search box, where a partial
            // match on the name or a supplier's code can still find it.
            setValue(hit.value);
            go({ q: hit.value });
            return `Searching for ${hit.value}`;
          }}
        />

        <Dialog
          open={open}
          onOpenChange={(next) => {
            // Opening is the moment to seed the draft from the URL, so a
            // cancelled edit is genuinely forgotten.
            if (next) setDraftCategory(category || ANY_CATEGORY);
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>
            <Button variant={category ? "soft" : "outline"}>
              <ACTIONS.filter />
              Filters
              {category ? (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                  1
                </span>
              ) : null}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Filters</DialogTitle>
              <DialogDescription>
                Narrow the grid down to one section of the shelf.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inventory-category">Category</Label>
              <Select value={draftCategory} onValueChange={setDraftCategory}>
                <SelectTrigger id="inventory-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={ANY_CATEGORY}>Any category</SelectItem>
                  {categories.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No categories yet — add one while creating a product.
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraftCategory(ANY_CATEGORY);
                  setOpen(false);
                  go({ category: "" });
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  go({
                    category: draftCategory === ANY_CATEGORY ? "" : draftCategory,
                  });
                }}
              >
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setValue("");
              go({ filter: "all", q: "", category: "" });
            }}
          >
            <ACTIONS.cancel /> Clear all
          </Button>
        ) : null}
      </div>

      {category ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => go({ category: "" })}
            aria-label={`Remove the ${category} category filter`}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-soft-foreground transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {category}
            <ACTIONS.cancel className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
