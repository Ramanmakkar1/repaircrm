"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
}: {
  basePath: string;
  q: string;
  /** Carried through a search so typing never drops the view you are in. */
  status: string;
  /** Same, for the customer filter the customer page links in with. */
  customerId?: string;
  placeholder: string;
}) {
  const router = useRouter();

  const queryRef = React.useRef<HTMLInputElement>(null);
  const readQuery = () => queryRef.current?.value ?? q;

  const navigate = React.useCallback(
    (nextQuery: string) => {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (status) params.set("status", status);
      if (customerId) params.set("customerId", customerId);
      const search = params.toString();
      // A new search resets to page 1 by simply not carrying `page` over.
      router.push(search ? `${basePath}?${search}` : basePath);
    },
    [basePath, customerId, router, status],
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
      <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
        <ACTIONS.search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
        <Input
          key={q}
          ref={queryRef}
          defaultValue={q}
          placeholder={placeholder}
          className="pl-9"
          aria-label="Search"
        />
      </div>

      <Button type="submit" variant="outline">
        <ACTIONS.search /> Search
      </Button>

      {q ? (
        <Button type="button" variant="ghost" onClick={() => navigate("")}>
          <ACTIONS.cancel /> Clear
        </Button>
      ) : null}
    </form>
  );
}
