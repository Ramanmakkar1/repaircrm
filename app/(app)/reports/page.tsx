import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  Clock,
  Download,
  FileSpreadsheet,
  Receipt,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  BarList,
  ColumnChart,
  CompareBars,
  compactCents,
  type Series,
} from "@/components/reports/charts";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  formatDuration,
  formatHours,
  resolveReportPeriod,
} from "@/components/reports/period";
import { loadReport } from "@/components/reports/query";
import { BigStat, CardLink, ReportCard } from "@/components/reports/stat-card";
import { requireUser } from "@/lib/auth";
import { currentLocationId } from "@/lib/location";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Reports · RepairFlow" };

// Every number here is "as of now"; a cached report is a wrong report.
export const dynamic = "force-dynamic";

/**
 * The shop's numbers for a period.
 *
 * ROLE RULE — money is scoped, not hidden. A technician gets the same page
 * minus every revenue figure, and the queries behind those figures are never
 * run for them (see components/reports/query.ts). Nothing is rendered and
 * CSS-hidden, so nothing leaks through "view source".
 *
 * The CSV export links are OWNER-only and point at /api/exports/*, which
 * re-checks the role itself — this is the polite half of the guard.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; location?: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { period: periodParam, location: locationParam } = await searchParams;

  const canSeeMoney = role === "OWNER" || role === "FRONT_DESK";
  const canExport = role === "OWNER";

  const period = resolveReportPeriod(periodParam);

  // `?location=` wins when it is given (so a branch report is linkable), and
  // the top-bar branch decides otherwise. Either way the id is re-validated
  // against this shop inside the query.
  const location = locationParam ?? (await currentLocationId());

  const { money, throughput, onTime, resolveTime, leaderboard } = await loadReport(
    shopId,
    period,
    { includeMoney: canSeeMoney, location },
  );

  // The export routes take an *inclusive* `to`, while a period carries an
  // exclusive upper bound — step back a day rather than shipping a range that
  // silently includes tomorrow.
  const toInclusive = new Date(period.toExclusive.getTime() - 86_400_000);
  const range = `?from=${period.from.toISOString().slice(0, 10)}&to=${toInclusive
    .toISOString()
    .slice(0, 10)}`;

  const grainWord = period.grain === "month" ? "month" : "week";
  const showValues = period.buckets.length <= 8;

  const throughputSeries: Series[] = [
    { key: "created", label: "Created", className: "bg-status-new" },
    { key: "resolved", label: "Resolved", className: "bg-status-resolved" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description={`${period.label} · ${period.rangeLabel}`}
        actions={
          canExport ? (
            <Button variant="outline" asChild>
              <a href={`/api/exports/customers.csv`}>
                <Download />
                Customers CSV
              </a>
            </Button>
          ) : undefined
        }
      />

      <PeriodPills active={period.key} />

      {/* Five tiles for a money-viewer, one for a technician — the column count
          follows so neither ends up with a lonely tile on its own row. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          money ? "xl:grid-cols-5" : "xl:grid-cols-4",
        )}
      >
        {money ? (
          <>
          <BigStat
            label="Revenue"
            value={formatCents(money.revenueCents)}
            hint={`${money.paymentCount} payment${
              money.paymentCount === 1 ? "" : "s"
            } collected`}
            icon={CircleDollarSign}
            tint="bg-status-resolved-bg text-status-resolved-fg"
          />
          <BigStat
            label="Invoices raised"
            value={String(money.invoices.raised)}
            hint={`${formatCents(money.invoices.raisedCents)} billed`}
            icon={Receipt}
            tint="bg-status-new-bg text-status-new-fg"
            href="/invoices"
          />
          <BigStat
            label="Invoices paid"
            value={String(money.invoices.paid)}
            hint={`${formatCents(money.invoices.paidCents)} settled`}
            icon={Wallet}
            tint="bg-status-ready-bg text-status-ready-fg"
            href="/invoices?status=PAID"
          />
          <BigStat
            label="Outstanding A/R"
            value={formatCents(money.ar.totalCents)}
            hint={`${money.ar.count} unpaid invoice${
              money.ar.count === 1 ? "" : "s"
            } · all time`}
            icon={TrendingUp}
            tint="bg-status-overdue-bg text-status-overdue-fg"
            href="/invoices?status=SENT"
          />
          </>
        ) : null}

        {/* Shown to every role: keeping a promise is not a money question. */}
        <BigStat
          label="On-time %"
          value={onTime.pct === null ? "—" : `${onTime.pct}%`}
          hint={
            onTime.withDue === 0
              ? "no dated tickets resolved yet"
              : `${onTime.onTime} of ${onTime.withDue} met their due date`
          }
          icon={CalendarCheck}
          tint="bg-status-ready-bg text-status-ready-fg"
          href="/tickets?due=overdue"
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {money ? (
          <>
            <ReportCard
              title="Revenue"
              description={`Payments collected, by ${grainWord}.`}
              className="lg:col-span-2"
              action={
                canExport ? (
                  <CardLink href={`/api/exports/payments.csv${range}`} download>
                    <Download className="size-4" />
                    Export CSV
                  </CardLink>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-1">
                <span className="text-[40px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                  {formatCents(money.revenueCents)}
                </span>
                <span className="text-[13.5px] text-muted-foreground">
                  {`across ${money.paymentCount} payment${
                    money.paymentCount === 1 ? "" : "s"
                  } · ${period.rangeLabel}`}
                </span>
              </div>
              <ColumnChart
                caption={`Revenue by ${grainWord}`}
                series={[{ key: "revenue", label: "Collected", className: "bg-accent" }]}
                rows={money.revenueByBucket.map((point) => ({
                  label: point.label,
                  fullLabel: point.fullLabel,
                  values: [point.value],
                }))}
                format={(value) => (showValues ? compactCents(value) : formatCents(value))}
                showValues={showValues}
              />
            </ReportCard>

            <ReportCard
              title="Payments by method"
              description="How the money actually arrived."
            >
              {money.byMethod.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No payments yet"
                  hint="Nothing was collected in this period."
                />
              ) : (
                <BarList
                  items={money.byMethod.map((row) => ({
                    label: row.label,
                    value: row.cents,
                    display: formatCents(row.cents),
                    hint: `${row.count} payment${row.count === 1 ? "" : "s"}`,
                    className: METHOD_TINT[row.method] ?? "bg-accent",
                  }))}
                />
              )}
            </ReportCard>

            <ReportCard
              title="Invoices raised vs paid"
              description="Documents in, documents settled."
              action={
                canExport ? (
                  <CardLink href={`/api/exports/invoices.csv${range}`} download>
                    <FileSpreadsheet className="size-4" />
                    Export CSV
                  </CardLink>
                ) : undefined
              }
            >
              <CompareBars
                items={[
                  {
                    label: "Raised",
                    value: money.invoices.raised,
                    display: String(money.invoices.raised),
                    className: "bg-status-new",
                  },
                  {
                    label: "Paid",
                    value: money.invoices.paid,
                    display: String(money.invoices.paid),
                    className: "bg-status-resolved",
                  },
                ]}
              />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {formatCents(money.invoices.raisedCents)} billed ·{" "}
                {formatCents(money.invoices.paidCents)} marked paid. Void invoices
                are excluded from both.
              </p>
            </ReportCard>
          </>
        ) : null}

        <ReportCard
          title="Ticket throughput"
          description={`Work in and work out, by ${grainWord}.`}
          className="lg:col-span-2"
          action={
            <CardLink href="/tickets?status=all">All tickets</CardLink>
          }
        >
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <Figure
              label="Created"
              value={String(throughput.created)}
              tint="text-status-new-fg"
            />
            <Figure
              label="Resolved"
              value={String(throughput.resolved)}
              tint="text-status-resolved-fg"
            />
            <Figure
              label="Net"
              value={`${throughput.created - throughput.resolved > 0 ? "+" : ""}${
                throughput.created - throughput.resolved
              }`}
              tint={
                throughput.created - throughput.resolved > 0
                  ? "text-status-overdue-fg"
                  : "text-muted-foreground"
              }
            />
          </div>
          <ColumnChart
            caption={`Tickets created and resolved by ${grainWord}`}
            series={throughputSeries}
            rows={throughput.byBucket.map((point) => ({
              label: point.label,
              fullLabel: point.fullLabel,
              values: [point.created, point.resolved],
            }))}
            format={(value) => String(value)}
          />
        </ReportCard>

        <ReportCard
          title="Time to resolve"
          description="From intake to resolved, for tickets closed in this period."
        >
          {resolveTime.count === 0 ? (
            <EmptyState
              icon={Timer}
              title="Nothing resolved yet"
              hint="Resolve a ticket and its turnaround lands here."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Figure
                  label="Median"
                  value={formatDuration(resolveTime.medianMs)}
                  big
                />
                <Figure label="Mean" value={formatDuration(resolveTime.meanMs)} big />
              </div>
              <dl className="flex flex-col gap-2 border-t border-border pt-4 text-[13.5px]">
                <Row label="Fastest" value={formatDuration(resolveTime.fastestMs)} />
                <Row label="Slowest" value={formatDuration(resolveTime.slowestMs)} />
                <Row
                  label="Tickets measured"
                  value={String(resolveTime.count)}
                />
              </dl>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                The median is the honest headline — one laptop waiting three weeks
                on a part drags the mean and nothing else.
              </p>
            </>
          )}
        </ReportCard>

        {money ? (
          <ReportCard
            title="Top products by revenue"
            description="Billed on invoices raised in this period."
          >
            {money.topProducts.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No product lines yet"
                hint="Invoice a catalogue product and it will rank here."
              />
            ) : (
              <BarList
                items={money.topProducts.map((product) => ({
                  label: product.name,
                  value: product.cents,
                  display: formatCents(product.cents),
                  hint: `${product.quantity} sold`,
                }))}
              />
            )}
          </ReportCard>
        ) : null}

        <ReportCard
          title="Tech leaderboard"
          description="Tickets resolved and hours logged in this period."
          className={money ? undefined : "lg:col-span-2"}
        >
          {leaderboard.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No activity yet"
              hint="Resolved tickets and stopped timers show up here."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {leaderboard.map((row, index) => (
                <li
                  key={row.userId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-sm text-[13px] font-bold tabular-nums",
                      index === 0
                        ? "bg-accent text-accent-foreground"
                        : "bg-surface-hover text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-foreground">
                    {row.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13.5px] font-semibold tabular-nums text-muted-foreground">
                    <Wrench className="size-4" />
                    {row.resolved}
                  </span>
                  <span className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-[13.5px] font-semibold tabular-nums text-muted-foreground">
                    <Clock className="size-4" />
                    {formatHours(row.seconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>
      </div>

      {!canSeeMoney ? (
        <p className="text-[13px] text-muted-foreground">
          Revenue, invoicing and product figures are visible to owners and front
          desk.{" "}
          <Link href="/tickets" className="font-semibold text-accent hover:underline">
            Go to tickets
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** Payment methods keep the same colour they wear on the invoice screens. */
const METHOD_TINT: Record<string, string> = {
  CARD: "bg-status-new",
  CASH: "bg-status-resolved",
  CHECK: "bg-status-waiting",
  CREDIT: "bg-status-ready",
  OTHER: "bg-status-in-progress",
};

function Figure({
  label,
  value,
  tint,
  big,
}: {
  label: string;
  value: string;
  tint?: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "font-bold leading-none tabular-nums tracking-tight text-foreground",
          big ? "text-[28px]" : "text-[26px]",
          tint,
        )}
      >
        {value}
      </span>
      <span className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
