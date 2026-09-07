"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
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
  /** "all" | "overdue" | "today" — the response-target lens on the board. */
  due: string;
  /** Set when the list is scoped to one customer. Never cleared by a filter. */
  customerId: string;
};

/**
 * The toolbar above the ticket table: search, the overflow "Filters" dialog,
 * and one "Clear" escape hatch.
 *
 * It used to be the whole filter surface — two rows of hand-rolled
 * `rounded-full` pills for status and for due date, each one a filled indigo
 * lozenge when selected. Those are gone: saved views are now `FilterTabs` and
 * the second-axis filters are `FilterChips`, both rendered by the SERVER page
 * as plain links. What is left here is the part that genuinely needs a client:
 * a text box and a dialog.
 *
 * The URL stays the single source of truth, so a filtered board is shareable
 * and the back button behaves. Sentinels ("open", "all", "created") are
 * stripped when they are the default so the everyday views keep clean URLs,
 * and `customerId` rides through every change — narrowing the status of one
 * customer's tickets must not silently widen the list to the whole shop.
 */
export function TicketToolbar({
  values,
  problemTypes,
}: {
  values: TicketFilterValues;
  problemTypes: string[];
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
      startTransition(() => router.push(ticketsHref({ ...values, ...patch })));
    },
    [router, values],
  );

  const advancedCount =
    (values.problemType !== "all" ? 1 : 0) + (values.sort !== "created" ? 1 : 0);

  const isFiltered =
    values.q !== "" ||
    values.status !== "open" ||
    values.due !== "all" ||
    values.tech !== "all" ||
    advancedCount > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={pending ? "" : undefined}
    >
      <form
        key={values.q}
        className="relative min-w-[220px] flex-1 sm:max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          push({ q: queryRef.current?.value.trim() ?? "" });
        }}
      >
        <ICONS.search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
        <Input
          ref={queryRef}
          name="q"
          defaultValue={values.q}
          placeholder="Search ticket #, subject or customer…"
          aria-label="Search tickets"
          className="pl-9"
        />
      </form>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <ACTIONS.filter />
            Filters
            {advancedCount > 0 ? (
              <span className="rf-num ml-0.5 rounded-sm bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-soft-foreground">
                {advancedCount}
              </span>
            ) : null}
          </Button>
        </DialogTrigger>
        <AdvancedFilters
          values={values}
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
          onClick={() =>
            startTransition(() =>
              // Clearing drops the filters, not the customer this list is
              // scoped to.
              router.push(
                ticketsHref({
                  q: "",
                  status: "open",
                  tech: "all",
                  problemType: "all",
                  sort: "created",
                  due: "all",
                  customerId: values.customerId,
                }),
              ),
            )
          }
        >
          <ACTIONS.cancel />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Mirrors `ticketsHref()` in the page. Duplicated rather than imported because
 * the page is a Server Component: a helper exported from a `"use client"`
 * module cannot be CALLED during a server render, and the reverse (importing a
 * server module here) would drag `db` into the browser bundle.
 */
function ticketsHref(values: TicketFilterValues): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status !== "open") params.set("status", values.status);
  if (values.tech !== "all") params.set("tech", values.tech);
  if (values.problemType !== "all") params.set("problemType", values.problemType);
  if (values.sort !== "created") params.set("sort", values.sort);
  if (values.due !== "all") params.set("due", values.due);
  if (values.customerId) params.set("customerId", values.customerId);
  // Any filter change invalidates the current page offset.
  const qs = params.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}

function AdvancedFilters({
  values,
  problemTypes,
  onApply,
}: {
  values: TicketFilterValues;
  problemTypes: string[];
  onApply: (patch: Partial<TicketFilterValues>) => void;
}) {
  const [problemType, setProblemType] = React.useState(values.problemType);
  const [sort, setSort] = React.useState(values.sort);

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>More filters</DialogTitle>
        <DialogDescription>
          Narrow the table to one kind of problem, or reorder it.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
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
            setProblemType("all");
            setSort("created");
          }}
        >
          Reset
        </Button>
        <Button type="button" onClick={() => onApply({ problemType, sort })}>
          <ACTIONS.filter />
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
