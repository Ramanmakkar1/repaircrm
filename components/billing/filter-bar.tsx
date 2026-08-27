"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";

export const ALL_STATUSES = "ALL";

/**
 * Search + status filter for the estimate and invoice lists.
 *
 * The status dropdown is gone: five statuses fit on one row of pills, and a
 * pill row shows the whole vocabulary at a glance instead of hiding four
 * options behind a click.
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
  statusOptions,
  placeholder,
}: {
  basePath: string;
  q: string;
  status: string;
  /**
   * Plain `{ value, label }` data rather than a `(status) => label` function —
   * functions cannot cross the server/client boundary as props.
   */
  statusOptions: readonly { value: string; label: string }[];
  placeholder: string;
}) {
  const router = useRouter();
  const selected = status || ALL_STATUSES;

  // The box is uncontrolled and keyed on the committed query, so the URL stays
  // the single source of truth: navigating (back button, "Clear", a link into a
  // filtered view) remounts it with the right value, and no effect is needed to
  // push server state back into React state.
  const queryRef = React.useRef<HTMLInputElement>(null);
  const readQuery = () => queryRef.current?.value ?? q;

  const navigate = React.useCallback(
    (nextQuery: string, nextStatus: string) => {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextStatus && nextStatus !== ALL_STATUSES) params.set("status", nextStatus);
      const search = params.toString();
      // Any filter change resets to page 1 by simply not carrying `page` over.
      router.push(search ? `${basePath}?${search}` : basePath);
    },
    [basePath, router],
  );

  const dirty = q !== "" || selected !== ALL_STATUSES;

  const pills = [{ value: ALL_STATUSES, label: "All" }, ...statusOptions];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {pills.map((pill) => {
          const active = selected === pill.value;
          return (
            <button
              key={pill.value}
              type="button"
              onClick={() => navigate(readQuery(), pill.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                  : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate(readQuery(), selected);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
          <Input
            key={q}
            ref={queryRef}
            defaultValue={q}
            placeholder={placeholder}
            className="pl-11"
            aria-label="Search"
          />
        </div>

        <Button type="submit" variant="outline">
          Search
        </Button>

        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("", ALL_STATUSES)}
          >
            <X /> Clear
          </Button>
        ) : null}
      </form>
    </div>
  );
}
