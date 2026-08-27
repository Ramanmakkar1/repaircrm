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
export function PeriodPills({ active }: { active: ReportPeriodKey }) {
  return (
    <nav aria-label="Reporting period" className="flex flex-wrap items-center gap-2">
      {REPORT_PERIODS.map((period) => {
        const current = period.key === active;
        return (
          <Link
            key={period.key}
            href={`/reports?period=${period.key}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              current
                ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {period.label}
          </Link>
        );
      })}
    </nav>
  );
}
