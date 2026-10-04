import * as React from "react";
import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { EstimateStatusBadge, InvoiceStatusBadge } from "@/components/billing/status-badge";
import { ICONS } from "@/components/ui/icons";
import { JOB_TABS, jobTabCount, jobTabHref, type JobTab, type JobTabCounts } from "./job-screen-logic";

/**
 * The frame of the Easy-mode repair screen.
 *
 *   phone                      tablet (lg and up)
 *   ┌────────────────┐         ┌──────────────────────────────┬───────────┐
 *   │ header         │         │ header                        │           │
 *   │ status row     │         ├──────────────────────────────┤ big button│
 *   │ side: quick,   │         │ status row                    │ at a glance│
 *   │   at a glance  │         │ [Work][Updates][Photos]...    │ quick tiles│
 *   │ tabs + section │         │ the section                   │           │
 *   │ ▔▔ pinned ▔▔▔▔ │         └──────────────────────────────┴───────────┘
 *   └────────────────┘
 *
 * One column on a phone, in reading order (who and what, where it stands, the
 * facts and quick actions, then the section), with the big button pinned above
 * the tab bar. From `lg` the section sits on the left and the big button, the
 * facts and the quick actions on the right.
 */
export function JobScreen({
  header,
  steps,
  side,
  main,
  pinned,
}: {
  header: React.ReactNode;
  /** The status row. */
  steps: React.ReactNode;
  /** The big button (side copy), the facts, the quick actions. */
  side: React.ReactNode;
  /** The tab row and the section. */
  main: React.ReactNode;
  /** The big button (phone copy), pinned to the bottom of the screen. */
  pinned?: React.ReactNode;
}) {
  return (
    // The DOM is in reading order (and so is the tab key); from `lg` the grid puts the side panel to the right,
    // spanning the status row and the section.
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">
      <div className="lg:col-span-2">{header}</div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2">{steps}</div>
      <aside
        aria-label="Next step and facts"
        className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start"
      >
        {side}
      </aside>
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-3">{main}</div>
      {pinned}
    </div>
  );
}

/**
 * The section tabs: big pills in the shared FilterTabs, one link per section.
 * The tab is in the URL (`?tab=money`), so a section can be shared and the back
 * button works; Work is the default and keeps the plain repair address.
 */
export function JobTabs({
  ticketId,
  active,
  counts,
}: {
  ticketId: string;
  active: JobTab;
  counts: JobTabCounts;
}) {
  return (
    // The shared row scrolls sideways when it must, with a thin scrollbar; here a tablet fits all five and a
    // phone scrolls by touch, so the bar is hidden (`!`: the app-wide `* { scrollbar-width }` is unlayered).
    <div className="[&_[role=navigation]]:[scrollbar-width:none]! [&_[role=navigation]::-webkit-scrollbar]:hidden">
      <FilterTabs
        aria-label="Repair sections"
        // Tighter than the shared pill (px-4) so all five fit the left column of a tablet without scrolling.
        className="[&>a]:px-3 lg:[&>a]:px-2.5"
        tabs={JOB_TABS.map((tab) => ({
          label: tab.label,
          href: jobTabHref(ticketId, tab.id),
          active: tab.id === active,
          count: jobTabCount(tab.id, counts),
        }))}
      />
    </div>
  );
}

export type JobDetailRow = { label: string; value: React.ReactNode };

/** Label / value lines in one bordered box, for the Customer & device section. */
export function JobDetailList({ rows, className }: { rows: JobDetailRow[]; className?: string }) {
  return (
    <dl className={cn("flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-base text-foreground sm:text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A heading for a block inside a section: big enough to scan, not a card title. */
export function JobBlockTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-lg font-semibold tracking-tight text-foreground">{children}</h2>;
}

export type JobMoneyLink = { id: string; number: number; status: string };

/**
 * The invoices and estimates that belong to this repair, as big links with the
 * status in words. They were only reachable from the Make invoice redirect and
 * the customer page before.
 */
export function JobMoneyLinks({
  invoices,
  estimates,
}: {
  invoices: JobMoneyLink[];
  estimates: JobMoneyLink[];
}) {
  if (invoices.length === 0 && estimates.length === 0) return null;

  return (
    <section aria-label="Invoices and estimates" className="flex flex-col gap-2">
      <JobBlockTitle>Invoices and estimates</JobBlockTitle>
      <ul className="flex flex-col gap-2">
        {invoices.map((invoice) => (
          <li key={`i-${invoice.id}`}>
            <Link
              href={`/invoices/${invoice.id}`}
              data-touch-control
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <ICONS.invoice aria-hidden className="size-5 text-muted-foreground" />
                Invoice <span className="rf-num">#{invoice.number}</span>
              </span>
              <InvoiceStatusBadge status={invoice.status} size="md" />
            </Link>
          </li>
        ))}
        {estimates.map((estimate) => (
          <li key={`e-${estimate.id}`}>
            <Link
              href={`/estimates/${estimate.id}`}
              data-touch-control
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <ICONS.estimate aria-hidden className="size-5 text-muted-foreground" />
                Estimate <span className="rf-num">#{estimate.number}</span>
              </span>
              <EstimateStatusBadge status={estimate.status} size="md" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What is on the bill so far, as one big link to the Money section. The charges
 * themselves live there; this is the glance a tech wants at the bench ("did I
 * put the part on?") without the table.
 */
export function JobBillLink({
  href,
  lines,
  total,
}: {
  href: string;
  /** How many charge lines the repair has. */
  lines: number;
  /** The total those lines foot to, formatted. */
  total: string | null;
}) {
  return (
    <Link
      href={href}
      data-touch-control
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2 text-base font-semibold">
        <ICONS.invoice aria-hidden className="size-5 text-muted-foreground" />
        {lines > 0 ? (
          <>
            On the bill: {lines} {lines === 1 ? "charge" : "charges"}
          </>
        ) : (
          "Nothing on the bill yet"
        )}
      </span>
      <span className="flex items-center gap-2 text-base">
        {total ? <span className="rf-num font-semibold">{total}</span> : null}
        <span className="text-sm text-accent-soft-foreground">{lines > 0 ? "See Money" : "Add a charge"}</span>
      </span>
    </Link>
  );
}
