"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { STATUS_META, normalizeStatus } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
 * Two tiers, so the everyday case is one tap:
 *   · a row of status pills + one search box, always visible;
 *   · tech / problem type / sort tucked into a "Filters" dialog, which shows a
 *     count when any of them is set so nothing hides silently.
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
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

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

  const advancedCount =
    (values.tech !== "all" ? 1 : 0) +
    (values.problemType !== "all" ? 1 : 0) +
    (values.sort !== "created" ? 1 : 0);

  const isFiltered = values.q !== "" || values.status !== "open" || advancedCount > 0;

  const pills: { value: string; label: string }[] = [
    { value: "open", label: "Open jobs" },
    { value: "all", label: "Everything" },
    ...statuses.map((s) => ({ value: s, label: s })),
  ];

  return (
    <div
      className="flex flex-col gap-3"
      data-pending={pending ? "" : undefined}
    >
      {/* Status pills — the filter a front-desk employee actually uses. */}
      <div className="flex flex-wrap items-center gap-2">
        {pills.map((pill) => {
          const active = values.status === pill.value;
          const meta =
            pill.value === "open" || pill.value === "all"
              ? null
              : STATUS_META[normalizeStatus(pill.value)];

          return (
            <button
              key={pill.value}
              type="button"
              onClick={() => push({ status: pill.value })}
              aria-pressed={active}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? meta
                    ? cn("border-transparent shadow-sm", meta.bg, meta.fg)
                    : "border-transparent bg-accent text-accent-foreground shadow-sm"
                  : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {meta ? (
                <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
              ) : null}
              {pill.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          key={values.q}
          className="relative min-w-[240px] flex-1 sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            push({ q: queryRef.current?.value.trim() ?? "" });
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
          <Input
            ref={queryRef}
            name="q"
            defaultValue={values.q}
            placeholder="Search ticket #, subject or customer…"
            aria-label="Search tickets"
            className="pl-11"
          />
        </form>

        <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal />
              Filters
              {advancedCount > 0 ? (
                <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                  {advancedCount}
                </span>
              ) : null}
            </Button>
          </DialogTrigger>
          <AdvancedFilters
            values={values}
            techs={techs}
            problemTypes={problemTypes}
            onApply={(patch) => {
              setAdvancedOpen(false);
              push(patch);
            }}
          />
        </Dialog>

        {isFiltered ? (
          <Button
            variant="ghost"
            onClick={() => startTransition(() => router.push("/tickets"))}
          >
            <X />
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AdvancedFilters({
  values,
  techs,
  problemTypes,
  onApply,
}: {
  values: TicketFilterValues;
  techs: { id: string; name: string }[];
  problemTypes: string[];
  onApply: (patch: Partial<TicketFilterValues>) => void;
}) {
  const [tech, setTech] = React.useState(values.tech);
  const [problemType, setProblemType] = React.useState(values.problemType);
  const [sort, setSort] = React.useState(values.sort);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>More filters</DialogTitle>
        <DialogDescription>
          Narrow the board down to one tech, one kind of problem, or reorder it.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <FilterField label="Assigned tech">
          <Select value={tech} onValueChange={setTech}>
            <SelectTrigger aria-label="Assigned tech">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All techs</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {techs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Problem type">
          <Select value={problemType} onValueChange={setProblemType}>
            <SelectTrigger aria-label="Problem type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All problems</SelectItem>
              {problemTypes.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Sort by">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Newest first</SelectItem>
              <SelectItem value="due">Due soonest</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTech("all");
            setProblemType("all");
            setSort("created");
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => onApply({ tech, problemType, sort })}
        >
          Show tickets
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
