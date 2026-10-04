"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { ACTIONS } from "@/components/ui/icons";

/**
 * Free-text search for the estimate and invoice lists.
 *
 * The row of `rounded-full` status pills that used to live here is gone. Saved
 * views are `FilterTabs` now — underline tabs rendered by the server page as
 * real links, the same control the purchase-order and inventory lists use — so
 * the whole app has one way of saying "you are looking at the unpaid ones"
 * instead of one per screen. What is left here is the part a link cannot do:
 * typing.
 *
 * The box is uncontrolled and keyed on the committed query, so the URL stays
 * the single source of truth: navigating (back button, "Clear", a link into a
 * filtered view) remounts it with the right value, and no effect is needed to
 * push server state back into React state.
 *
 * Current values arrive as props from the server page rather than through
 * `useSearchParams`, which keeps this component out of the Suspense-boundary
 * requirements that hook imposes, and keeps the page the single source of
 * truth for what the query actually filtered on.
 */
export function BillingFilterBar({
  basePath,
  q,
  status,
  customerId = "",
  placeholder,
  large = false,
  statusParam = "status",
}: {
  basePath: string;
  q: string;
  /** Carried through a search so typing never drops the view you are in. */
  status: string;
  /** Same, for the customer filter the customer page links in with. */
  customerId?: string;
  placeholder: string;
  /** Easy mode: a 48px field and big buttons, the same search the register uses. */
  large?: boolean;
  /** The URL param the view travels in. Recurring billing calls it "view". */
  statusParam?: string;
}) {
  const router = useRouter();

  const queryRef = React.useRef<HTMLInputElement>(null);
  const readQuery = () => queryRef.current?.value ?? q;

  const navigate = React.useCallback(
    (nextQuery: string) => {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (status) params.set(statusParam, status);
      if (customerId) params.set("customerId", customerId);
      const search = params.toString();
      // A new search resets to page 1 by simply not carrying `page` over.
      router.push(search ? `${basePath}?${search}` : basePath);
    },
    [basePath, customerId, router, status, statusParam],
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigate(readQuery());
      }}
      role="search"
      className="flex flex-wrap items-center gap-2"
    >
      <div className={cn("relative flex-1", large ? "min-w-0 basis-56 sm:max-w-xl" : "min-w-[240px] sm:max-w-sm")}>
        <ACTIONS.search
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-faint-foreground",
            large ? "left-4 size-5" : "left-3 size-4",
          )}
        />
        <Input
          key={q}
          ref={queryRef}
          defaultValue={q}
          placeholder={placeholder}
          className={large ? "h-12 rounded-xl pl-12 text-base" : "pl-9"}
          aria-label="Search"
        />
      </div>

      <Button type="submit" variant="outline" className={large ? "h-12 rounded-xl px-5 text-base" : undefined}>
        <ACTIONS.search /> Search
      </Button>

      {q ? (
        <Button
          type="button"
          variant="ghost"
          className={large ? "h-12 rounded-xl px-4 text-base" : undefined}
          onClick={() => navigate("")}
        >
          <ACTIONS.cancel /> Clear
        </Button>
      ) : null}
    </form>
  );
}
