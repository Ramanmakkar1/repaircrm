"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";

/**
 * Debounced search that keeps the URL as the source of truth (?q=…), so the
 * result is shareable, back-button friendly, and still works with JS disabled
 * via the wrapping form's native GET submit.
 */
export function CustomerSearch({ query }: { query: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);
  const [pending, startTransition] = React.useTransition();

  // Keep in step when the URL changes from elsewhere (back button, Clear).
  React.useEffect(() => setValue(query), [query]);

  React.useEffect(() => {
    if (value.trim() === query.trim()) return;
    const timer = setTimeout(() => {
      startTransition(() => router.replace(hrefFor(value), { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, query, router]);

  return (
    <form
      action="/customers"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => router.replace(hrefFor(value), { scroll: false }));
      }}
      className="relative w-full sm:max-w-sm"
      role="search"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
      <Input
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search name, business, email, phone…"
        aria-label="Search customers"
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
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-faint-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <X className="size-[18px]" />
          </button>
        ) : null}
      </div>
    </form>
  );
}

function hrefFor(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `/customers?q=${encodeURIComponent(trimmed)}` : "/customers";
}
