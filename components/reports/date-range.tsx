import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import type { ReportPeriod } from "./period";

/**
 * "Show me April 3rd to the 19th."
 *
 * A plain GET form, not a client component — submitting it navigates to
 * `/reports?period=custom&from=…&to=…`, which is the same URL the pills produce
 * and therefore bookmarkable, shareable and back-button-able in exactly the
 * same way. No JavaScript is involved in any of that.
 *
 * The inputs are seeded with the range currently on screen, so switching from
 * "Last month" to a custom window starts from last month's dates rather than
 * from nothing.
 *
 * Easy mode tucks the two dates behind one big "Pick your own dates" button
 * (open already when a custom range is on screen), so the page starts with
 * four choices instead of four choices and a form. Full mode keeps it inline.
 */
export function DateRangeForm({
  period,
  location,
  simple = false,
}: {
  period: ReportPeriod;
  /** Carried through so picking a range does not silently reset the location. */
  location?: string | null;
  simple?: boolean;
}) {
  const active = period.key === "custom";

  const form = (
    <form
      method="get"
      action="/reports"
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="period" value="custom" />
      {location ? (
        <input type="hidden" name="location" value={location} />
      ) : null}

      <Field label="From" name="from" value={period.fromValue} />
      <Field label="To" name="to" value={period.toValue} />

      <Button
        type="submit"
        variant={active ? "default" : "outline"}
        size="lg"
        className="h-12 rounded-xl px-5 text-base"
      >
        <ACTIONS.filter />
        Apply dates
      </Button>
    </form>
  );

  if (!simple) return form;

  return (
    <details
      open={active}
      className="group w-full rounded-2xl border border-border bg-surface sm:w-fit sm:open:w-full"
    >
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center justify-between gap-6 rounded-2xl px-4 text-[15px] font-semibold",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
        )}
      >
        <span>
          Pick your own dates
          {active ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {period.rangeLabel}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border p-4">{form}</div>
    </details>
  );
}

function Field({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        className={cn(
          "h-12 rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] font-semibold text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      />
    </label>
  );
}
