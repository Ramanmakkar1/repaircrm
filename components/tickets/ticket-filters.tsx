"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TicketFilterValues = {
  q: string;
  status: string;
  tech: string;
  problemType: string;
  sort: string;
};

/**
 * The filter bar owns the URL, not local state: every control rewrites the
 * query string and lets the server component re-query. That keeps a filtered
 * view shareable/bookmarkable and means back/forward behave the way a list
 * view should.
 *
 * Sentinels ("open", "all", "unassigned") are stripped when they're the
 * default, so the common views stay on clean URLs.
 */
export function TicketFilters({
  values,
  statuses,
  problemTypes,
  techs,
}: {
  values: TicketFilterValues;
  statuses: string[];
  problemTypes: string[];
  techs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // The search box is uncontrolled and keyed on the committed query, so the URL
  // stays the single source of truth: navigating (back button, "Clear", a link
  // into a filtered view) remounts it with the right value, and no effect is
  // needed to push server state back into React state.
  const queryRef = React.useRef<HTMLInputElement>(null);

  const push = React.useCallback(
    (patch: Partial<TicketFilterValues>) => {
      const next = { ...values, ...patch };
      const params = new URLSearchParams();
      if (next.q) params.set("q", next.q);
      if (next.status && next.status !== "open") params.set("status", next.status);
      if (next.tech && next.tech !== "all") params.set("tech", next.tech);
      if (next.problemType && next.problemType !== "all") {
        params.set("problemType", next.problemType);
      }
      if (next.sort && next.sort !== "created") params.set("sort", next.sort);
      // Any filter change invalidates the current page offset.
      const qs = params.toString();
      startTransition(() => router.push(qs ? `/tickets?${qs}` : "/tickets"));
    },
    [router, values],
  );

  const isFiltered =
    values.q !== "" ||
    values.status !== "open" ||
    values.tech !== "all" ||
    values.problemType !== "all" ||
    values.sort !== "created";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={pending ? "" : undefined}
    >
      <form
        key={values.q}
        className="relative min-w-[200px] flex-1 sm:max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          push({ q: queryRef.current?.value.trim() ?? "" });
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint-foreground" />
        <Input
          ref={queryRef}
          name="q"
          defaultValue={values.q}
          placeholder="Search #, subject or customer…"
          aria-label="Search tickets"
          className="pl-8"
        />
      </form>

      <FilterSelect
        label="Status"
        value={values.status}
        onChange={(status) => push({ status })}
        options={[
          { value: "open", label: "Not Resolved" },
          { value: "all", label: "All statuses" },
          ...statuses.map((s) => ({ value: s, label: s })),
        ]}
      />

      <FilterSelect
        label="Tech"
        value={values.tech}
        onChange={(tech) => push({ tech })}
        options={[
          { value: "all", label: "All techs" },
          { value: "unassigned", label: "Unassigned" },
          ...techs.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />

      <FilterSelect
        label="Problem"
        value={values.problemType}
        onChange={(problemType) => push({ problemType })}
        options={[
          { value: "all", label: "All problems" },
          ...problemTypes.map((p) => ({ value: p, label: p })),
        ]}
      />

      <FilterSelect
        label="Sort"
        value={values.sort}
        onChange={(sort) => push({ sort })}
        options={[
          { value: "created", label: "Newest first" },
          { value: "due", label: "Due soonest" },
        ]}
      />

      {isFiltered ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.push("/tickets"))}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-[9.5rem]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
