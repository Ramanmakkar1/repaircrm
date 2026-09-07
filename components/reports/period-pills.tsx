import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { REPORT_PERIODS, type ReportPeriodKey } from "./period";

/**
 * The four range pills above the report.
 *
 * Plain links, not a client component: the whole page is server-rendered from
 * `?period=`, so making these buttons would mean shipping JavaScript purely to
 * do what an anchor already does — and would cost the operator the ability to
 * open "Last month" in a new tab.
 */
export function PeriodPills({
  active,
  location,
}: {
  active: ReportPeriodKey;
  /** Carried through so switching period does not reset the location filter. */
  location?: string | null;
}) {
  const suffix = location ? `&location=${encodeURIComponent(location)}` : "";

  return (
    /*
     * A segmented control, not four separate buttons — one of these is always
     * chosen, so they are a single switch with four positions and should look
     * like one. The old filled-indigo lozenge made "This month" read as the
     * page's primary action rather than as the state it is. Segmented (rather
     * than the underline `FilterTabs` used on list pages) because this sits
     * mid-row beside the custom date range, where an underline would float
     * with nothing to sit on.
     */
    <nav
      aria-label="Reporting period"
      className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-hover p-1"
    >
      {REPORT_PERIODS.map((period) => {
        const current = period.key === active;
        return (
          <Link
            key={period.key}
            href={`/reports?period=${period.key}${suffix}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center whitespace-nowrap rounded-sm px-3 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              current
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {period.label}
          </Link>
        );
      })}
    </nav>
  );
}
