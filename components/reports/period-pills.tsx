import { FilterTabs } from "@/components/ui/filter-tabs";
import { REPORT_PERIODS, type ReportPeriodKey } from "./period";

/**
 * The four period choices above the report, as the same big pill tabs every
 * list screen uses (This month, Last month, Last 90 days, This year).
 *
 * Plain links, not a client component: the whole page is server-rendered from
 * `?period=`, so making these buttons would mean shipping JavaScript purely to
 * do what an anchor already does - and would cost the operator the ability to
 * open "Last month" in a new tab.
 *
 * One of these is always chosen (or none, when a hand-picked date range is on
 * screen - the date control below says so), and the chosen one is filled and
 * carries `aria-current`, so it never relies on colour alone.
 */
export function PeriodPills({
  active,
  location,
}: {
  active: ReportPeriodKey;
  /** Carried through so switching period does not reset the location filter. */
  location?: string | null;
}) {
  return (
    <FilterTabs
      aria-label="Reporting period"
      tabs={periodTabs(active, location)}
    />
  );
}

/** The tabs, as data: one per period, each a URL that keeps the location. */
export function periodTabs(active: ReportPeriodKey, location?: string | null) {
  const suffix = location ? `&location=${encodeURIComponent(location)}` : "";
  return REPORT_PERIODS.map((period) => ({
    label: period.label,
    href: `/reports?period=${period.key}${suffix}`,
    active: period.key === active,
  }));
}
