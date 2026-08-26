"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ALL_STATUSES = "ALL";

/**
 * Search + status filter for the estimate and invoice lists.
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
  const [query, setQuery] = React.useState(q);
  const [selected, setSelected] = React.useState(status || ALL_STATUSES);

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

  const dirty = query !== "" || selected !== ALL_STATUSES;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate(query, selected);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Search"
        />
      </div>

      <Select
        value={selected}
        onValueChange={(v) => {
          setSelected(v);
          navigate(query, v);
        }}
      >
        <SelectTrigger className="w-[150px]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="outline">
        Search
      </Button>

      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setQuery("");
            setSelected(ALL_STATUSES);
            navigate("", ALL_STATUSES);
          }}
        >
          <X /> Clear
        </Button>
      ) : null}
    </form>
  );
}
