"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * The one large search box on a list screen (Purchase orders, Suppliers).
 *
 * The URL stays the source of truth: typing waits a beat, then replaces the
 * address with `?q=...` plus whatever else the view already carries (`keep`), so
 * a search is shareable and the back button behaves. Enter searches at once.
 * It is a plain 48px-tall field with a clear button as big as a thumb.
 */
export function ListSearch({
  path,
  query,
  keep = {},
  placeholder,
  label,
}: {
  /** The list's own path, e.g. "/inventory/vendors". */
  path: string;
  /** The committed query from the URL. */
  query: string;
  /** Other params the current view carries and a search must not drop (empty ones are skipped). */
  keep?: Record<string, string>;
  placeholder: string;
  /** The accessible name of the box. */
  label: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);
  const [pending, startTransition] = React.useTransition();

  // Follow the URL when it changes from somewhere else (back button, "Clear" link).
  const [lastQuery, setLastQuery] = React.useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setValue(query);
  }

  const keepKey = JSON.stringify(keep);
  const go = React.useCallback(
    (text: string) => {
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(JSON.parse(keepKey) as Record<string, string>)) {
        if (val) params.set(key, val);
      }
      if (text.trim()) params.set("q", text.trim());
      const search = params.toString();
      startTransition(() => router.replace(search ? `${path}?${search}` : path, { scroll: false }));
    },
    [keepKey, path, router],
  );

  React.useEffect(() => {
    if (value.trim() === query.trim()) return;
    const timer = setTimeout(() => go(value), 250);
    return () => clearTimeout(timer);
  }, [value, query, go]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
      className="relative w-full sm:max-w-xl"
    >
      <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
      <Input
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-12 rounded-xl pl-12 pr-12 text-base"
      />
      <span className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center">
        {pending ? (
          <Loader2 aria-hidden className="size-5 animate-spin text-faint-foreground" />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Clear search"
            className="flex size-12 items-center justify-center rounded-xl text-faint-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-5" />
          </button>
        ) : null}
      </span>
    </form>
  );
}
