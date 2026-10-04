import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { loadShopZone } from "@/components/billing/print-queries";
import { shopNow } from "@/components/billing/shop-clock";
import { readUiPrefs } from "@/lib/prefs";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { customerLabel } from "@/components/customers/format";
import { RowLink } from "@/components/list/row-link";
import { DocumentGrid, ScheduleCard } from "@/components/billing/document-cards";
import { BillingFilterBar } from "@/components/billing/filter-bar";
import { formatDate } from "@/components/billing/format";
import { matchesSchedule, sentenceCase } from "@/components/billing/record-format";
import {
  FREQUENCY_CADENCE,
  SCHEDULE_STATE_META,
  asFrequency,
  frequencyLabel,
  isDue,
  scheduleState,
} from "@/components/recurring/meta";
import {
  GenerateDueButton,
  ScheduleActiveSwitch,
} from "@/components/recurring/schedule-controls";

export const metadata = { title: "Repeat bills · Repairs helper" };

/**
 * The saved views. Every schedule is already in memory — this list is small by
 * nature and deliberately unpaginated — so the counts beside each tab cost
 * nothing and the filtering is a `.filter()`, not a second query.
 */
const VIEWS = ["all", "due", "active", "paused"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  all: "All",
  due: "Due now",
  active: "Active",
  paused: "Paused",
};

function asView(value: string | string[] | undefined): View {
  return (VIEWS as readonly string[]).includes(String(value)) ? (value as View) : "all";
}

export default async function RecurringSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [params, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  const view = asView(params.view);
  // Easy mode (the default) shows cards and a search box; Full mode keeps the table.
  const easy = prefs.simple;
  const q = easy && typeof params.q === "string" ? params.q.trim() : "";

  const schedules = await db.recurringInvoice.findMany({
    where: { shopId },
    // Live schedules first, then whichever is due soonest.
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, businessName: true },
      },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      _count: { select: { invoices: true } },
    },
  });

  // A run date is a calendar day: "due" and every date on the cards are read
  // on the shop's own clock, not the server's.
  const zone = await loadShopZone(shopId);
  const now = shopNow(requestNow(), zone);
  const due = schedules.filter((s) => isDue(s.nextRunAt, s.active, now));
  const dueCount = due.length;

  const counts: Record<View, number> = {
    all: schedules.length,
    due: dueCount,
    active: schedules.filter((s) => s.active).length,
    paused: schedules.filter((s) => !s.active).length,
  };

  const inView =
    view === "all"
      ? schedules
      : view === "due"
        ? due
        : schedules.filter((s) => (view === "active" ? s.active : !s.active));
  // Typing narrows the view you are in; it never changes what the tabs count.
  const rows = q
    ? inView.filter((s) => matchesSchedule(q, [s.name, customerLabel(s.customer)]))
    : inView;

  const emptyState = (
    <EmptyState
      icon={ICONS.recurring}
      title={
        schedules.length === 0
          ? "No repeat bills yet"
          : q
            ? "No repeat bills match that search"
            : "Nothing in this view"
      }
      hint={
        schedules.length === 0
          ? "Set one up for a monthly support plan or a regular service, and a draft invoice is made for you each time."
          : q
            ? "Try a different name, or clear the search."
            : "Every schedule is on one of the other tabs."
      }
      action={
        schedules.length === 0 ? (
          <Button asChild className={cn(easy && "px-6 text-base")}>
            <Link href="/invoices/recurring/new">
              <ACTIONS.add /> New repeat bill
            </Link>
          </Button>
        ) : (
          <Button variant="outline" asChild className={cn(easy && "px-6 text-base")}>
            <Link href="/invoices/recurring">Show all repeat bills</Link>
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Easy mode keeps one Back: the shell's. */}
      {easy ? null : (
        <Link
          href="/invoices"
          className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ACTIONS.back className="size-4" />
          All invoices
        </Link>
      )}

      <PageHeader
        title="Repeat bills"
        description={
          easy
            ? "Bills that make themselves on a schedule, like a monthly support plan."
            : "Contracts and retainers that make a draft invoice on a schedule."
        }
        actions={
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              // The generate button belongs to the recurring kit, so its size is set from here.
              easy && "[&_button]:min-h-12 [&_button]:px-5 [&_button]:text-base",
            )}
          >
            {dueCount > 0 ? <GenerateDueButton dueCount={dueCount} /> : null}
            <Button variant={dueCount > 0 ? "outline" : "default"} asChild className={cn(easy && "px-5 text-base")}>
              <Link href="/invoices/recurring/new">
                <ACTIONS.add /> New repeat bill
              </Link>
            </Button>
          </div>
        }
      />

      {schedules.length > 0 ? (
        <FilterTabs
          aria-label="Schedule views"
          tabs={VIEWS.map((key) => ({
            label: VIEW_LABELS[key],
            href: hrefFor(key, q),
            active: view === key,
            count: counts[key],
          }))}
        />
      ) : null}

      {easy && schedules.length > 0 ? (
        <BillingFilterBar
          basePath="/invoices/recurring"
          q={q}
          status={view === "all" ? "" : view}
          statusParam="view"
          placeholder="Schedule or customer"
          large
        />
      ) : null}

      {easy ? (
        rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">{emptyState}</div>
        ) : (
          <DocumentGrid>
            {rows.map((schedule) => {
              const isDueNow = isDue(schedule.nextRunAt, schedule.active, now);
              return (
                <li key={schedule.id}>
                  <ScheduleCard
                    now={now}
                    schedule={{
                      id: schedule.id,
                      name: schedule.name,
                      customerName: customerLabel(schedule.customer),
                      cadence: sentenceCase(FREQUENCY_CADENCE[asFrequency(schedule.frequency)]),
                      nextRunAt: schedule.nextRunAt,
                      active: schedule.active,
                      due: isDueNow,
                      autoSend: schedule.autoSend,
                      autoCharge: schedule.autoCharge,
                      lastChargeError: schedule.lastChargeError,
                      invoiceCount: schedule._count.invoices,
                      totalCents: calcTotals(schedule.lines, schedule.taxRateBps).totalCents,
                      state: SCHEDULE_STATE_META[scheduleState(schedule.active, isDueNow)],
                    }}
                  />
                </li>
              );
            })}
          </DocumentGrid>
        )
      ) : (
        <Card>
          <CardContent className="px-0 py-0">
            {rows.length === 0 ? (
              emptyState
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Schedule</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Every</Th>
                    <Th>Next bill</Th>
                    <Th className="text-right">Invoices</Th>
                    <Th className="text-right">Each bill</Th>
                    <Th className="text-right">Live</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((schedule) => {
                    const totals = calcTotals(schedule.lines, schedule.taxRateBps);
                    const isDueNow = isDue(schedule.nextRunAt, schedule.active, now);
                    const state =
                      SCHEDULE_STATE_META[scheduleState(schedule.active, isDueNow)];

                    return (
                      <RowLink
                        key={schedule.id}
                        href={`/invoices/recurring/${schedule.id}`}
                        className={cn(!schedule.active && "text-muted-foreground")}
                      >
                        <Td>
                          <Link
                            href={`/invoices/recurring/${schedule.id}`}
                            className="block max-w-[260px] truncate font-semibold text-foreground hover:underline"
                          >
                            {schedule.name}
                          </Link>
                        </Td>
                        {/* Plain text — see the note on the invoices list. */}
                        <Td>
                          <span className="block max-w-[200px] truncate font-medium text-foreground">
                            {customerLabel(schedule.customer)}
                          </span>
                        </Td>
                        <Td>
                          <span className="flex items-center gap-1.5">
                            <StatusPill tone={state.tone} label={state.label} />
                            {/* Cleared automatically on the next successful
                                charge, so this only ever describes right now. */}
                            {schedule.lastChargeError ? (
                              <StatusPill
                                size="sm"
                                tone="danger"
                                label="Charge failed"
                                title={schedule.lastChargeError}
                              />
                            ) : null}
                          </span>
                        </Td>
                        <Td>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            {frequencyLabel(schedule.frequency)}
                            {schedule.autoSend ? <Chip>Auto-send</Chip> : null}
                            {schedule.autoCharge ? (
                              <Chip className="bg-chip-accent-bg text-chip-accent-fg">
                                Auto-charge
                              </Chip>
                            ) : null}
                          </span>
                        </Td>
                        <Td
                          className={cn(
                            "text-muted-foreground",
                            isDueNow && "font-semibold text-status-overdue-fg",
                          )}
                        >
                          {formatDate(schedule.nextRunAt)}
                        </Td>
                        <Td className="text-right text-muted-foreground">
                          {schedule._count.invoices}
                        </Td>
                        <Td className="text-right font-semibold text-foreground">
                          {formatCents(totals.totalCents)}
                        </Td>
                        <Td className="w-px text-right">
                          <ScheduleActiveSwitch
                            scheduleId={schedule.id}
                            active={schedule.active}
                            scheduleName={schedule.name}
                          />
                        </Td>
                      </RowLink>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A view is a URL: shareable, bookmarkable, and back-button correct. */
function hrefFor(view: View, q = ""): string {
  const search = new URLSearchParams();
  if (view !== "all") search.set("view", view);
  if (q) search.set("q", q);
  const qs = search.toString();
  return qs ? `/invoices/recurring?${qs}` : "/invoices/recurring";
}
