import { ChevronDown } from "lucide-react";

import { FilterChips } from "@/components/ui/filter-tabs";

/**
 * "Supplier: All" as one tidy row that opens into the choices.
 *
 * A shop with a handful of suppliers would otherwise get a wall of pills under
 * the tabs (five rows on a phone). Closed, it is one 48px bar that says which
 * supplier you are looking at; opened, it is the same FilterChips as ever, and
 * each is a link, so a view is still just a URL. Needs no JavaScript.
 *
 * The panel is keyed on the chosen option's link. React only writes `open` when
 * the prop changes, so a panel opened by hand would otherwise stay open after
 * you picked a supplier; the key makes it start over closed on every new view.
 */
export function SupplierFilter({
  current,
  options,
}: {
  /** The name of the supplier being filtered on, or "All". */
  current: string;
  options: { label: string; href: string; active?: boolean }[];
}) {
  return (
    <details key={options.find((option) => option.active)?.href ?? current} className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">Supplier: </span>
          <span className="font-semibold">{current}</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-3">
        <FilterChips options={options} />
      </div>
    </details>
  );
}
