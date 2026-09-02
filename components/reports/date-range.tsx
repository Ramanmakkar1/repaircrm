import { Button } from "@/components/ui/button";
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
 */
export function DateRangeForm({
  period,
  location,
}: {
  period: ReportPeriod;
  /** Carried through so picking a range does not silently reset the location. */
  location?: string | null;
}) {
  const active = period.key === "custom";

  return (
    <form
      method="get"
      action="/reports"
      className="flex flex-wrap items-end gap-2"
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
        className="h-10 rounded-full px-4"
      >
        Apply range
      </Button>
    </form>
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
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        className={cn(
          "h-10 rounded-full border border-border-strong bg-surface px-3.5 text-[13.5px] font-semibold text-foreground shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      />
    </label>
  );
}
