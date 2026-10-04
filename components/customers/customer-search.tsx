"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { ICONS } from "@/components/ui/icons";

/**
 * Debounced search that keeps the URL as the source of truth (?q=…), so the
 * result is shareable, back-button friendly, and still works with JS disabled
 * via the wrapping form's native GET submit.
 */
export function CustomerSearch({ query, large = false }: { query: string; large?: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);
  const [pending, startTransition] = React.useTransition();

  // Keep in step when the URL changes from elsewhere (back button, Clear).
  // Adjusted during render rather than from an effect: React re-runs this
  // component before it touches the DOM, so the box never paints the old
  // term and then correct it a frame later.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setValue(query);
  }

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
      className={cn("relative w-full", large ? "max-w-2xl" : "sm:max-w-sm")}
      role="search"
    >
      <ICONS.search
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-faint-foreground",
          large ? "left-4 size-6" : "left-3.5 size-[18px]",
        )}
      />
      {/*
        `large` is the Easy mode counter search: the main control on the
        screen, 56px tall with 18px text. It still searches every field (name,
        business, email, phone); the shorter prompt only names the two things
        people type at a counter.
      */}
      <Input
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={large ? "Search name or phone" : "Search name, business, email, phone…"}
        aria-label="Search customers"
        autoComplete="off"
        enterKeyHint="search"
        className={large ? "h-14 rounded-xl pl-14 pr-14 text-lg" : "pl-11 pr-11"}
      />
      <div className={cn("absolute top-1/2 -translate-y-1/2", large ? "right-2" : "right-3")}>
        {pending ? (
          <Loader2 className={cn("animate-spin text-faint-foreground", large ? "mr-3 size-5" : "size-[18px]")} />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Clear search"
            className={cn(
              "flex items-center justify-center rounded-full text-faint-foreground transition-colors",
              large ? "size-11" : "size-5",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <X className={large ? "size-5" : "size-[18px]"} />
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
