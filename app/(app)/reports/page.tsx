import Link from "next/link";
import {
  CalendarCheck,
  CircleCheckBig,
  CircleDollarSign,
  Clock,
  FileSpreadsheet,
  HandCoins,
  Timer,
  TrendingUp,
} from "lucide-react";

import { ACTIONS, ICONS } from "@/components/ui/icons";
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
import { DateRangeForm } from "@/components/reports/date-range";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  formatDuration,
  formatHours,
  resolveReportPeriod,
} from "@/components/reports/period";
import { loadReport } from "@/components/reports/query";
import {
  CardLink,
  KpiTile,
  ReportCard,
  type KpiTileProps,
} from "@/components/reports/stat-card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ALL_LOCATIONS, currentLocationId } from "@/lib/location";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { safeTimeZone } from "@/lib/dashboard/logic";

export const metadata = { title: "Reports · Repairs helper" };

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
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    location?: string;
  }>;
}) {
  const { shopId, role } = await requireUser();
  const [params, { simple }, shop] = await Promise.all([
    searchParams,
    readUiPrefs(),
    db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } }),
  ]);

  const canSeeMoney = role === "OWNER" || role === "FRONT_DESK";
  const canExport = role === "OWNER";

  // The shop's own calendar days, cut at its own midnight (Shop.timezone): a
  // 9pm Saturday sale is Saturday's here, as it is on the Shop overview.
  const period = resolveReportPeriod(params, new Date(requestNow()), safeTimeZone(shop?.timezone));

  // `?location=` wins when it is given (so a branch report is linkable), and
  // the top-bar branch decides otherwise. Either way the id is re-read against
  // this shop before it filters anything — an id from another tenant matches
  // nothing and the report falls back to the whole shop rather than 404ing on
  // a link somebody pasted.
  const requested = params.location ?? (await currentLocationId());
  const location =
    requested && requested !== ALL_LOCATIONS
      ? await db.location.findFirst({
          where: { id: requested, shopId },
          select: { id: true, name: true },
        })
      : null;

  const { money, throughput, onTime, resolveTime, leaderboard } = await loadReport(
    shopId,
    period,
    { includeMoney: canSeeMoney, locationId: location?.id ?? null },
  );

  // The export routes take the same parameters this page did, so the file and
  // the screen can never disagree about which window they cover.
  const range =
    `?period=${period.key}&from=${period.fromValue}&to=${period.toValue}` +
    (location ? `&location=${location.id}` : "");

  const grainWord = period.grain === "month" ? "month" : "week";
  const showValues = period.buckets.length <= 8;

  const throughputSeries: Series[] = [
    { key: "created", label: "Taken in", className: "bg-status-new" },
    { key: "resolved", label: "Finished", className: "bg-status-resolved" },
  ];

  const tile = (kpi: Kpi, variant: "stat" | "large" | "small") => (
    <KpiTile
      key={kpi.label}
      variant={variant}
      label={kpi.label}
      value={kpi.value}
      hint={kpi.hint}
      icon={kpi.icon}
      tone={kpi.tone}
      href={kpi.href}
    />
  );

  // The headline numbers, in the order the dense view shows them. `primary`
  // marks the few that Easy mode makes big.
  const kpis: Kpi[] = [
    ...(money
      ? [
          {
            label: "Money in after refunds",
            value: formatCents(money.netRevenueCents),
            hint: `${formatCents(money.revenueCents)} taken · ${formatCents(
              money.refundCents,
            )} refunded`,
            icon: CircleDollarSign,
            tone: "success" as const,
            primary: true,
          },
          {
            label: "Refunds",
            value: formatCents(money.refundCents),
            hint: `${money.refundCount} refund${
              money.refundCount === 1 ? "" : "s"
            } given back`,
            icon: ACTIONS.refund,
            tone: "danger" as const,
          },
          {
            label: "Deposits you hold",
            value: formatCents(money.depositsHeldCents),
            hint: `${money.depositsHeldCount} deposit${
              money.depositsHeldCount === 1 ? "" : "s"
            } not used yet · right now`,
            icon: HandCoins,
            tone: "info" as const,
          },
          {
            label: "Invoices written",
            value: String(money.invoices.raised),
            hint: `${formatCents(money.invoices.raisedCents)} billed`,
            icon: ICONS.invoice,
            tone: "info" as const,
            href: "/invoices",
          },
          {
            label: "Invoices paid",
            value: String(money.invoices.paid),
            hint: `${formatCents(money.invoices.paidCents)} paid in full`,
            icon: ICONS.deposit,
            tone: "ready" as const,
            href: "/invoices?status=PAID",
          },
          // The same "Owed to you" as the Shop overview and the invoices list's
          // Unpaid view: one definition (components/reports/query.ts).
          {
            label: "Owed to you",
            value: `${money.ar.truncated ? "at least " : ""}${formatCents(money.ar.totalCents)}`,
            hint: `${money.ar.count} unpaid invoice${money.ar.count === 1 ? "" : "s"}${
              money.ar.overdueCount > 0 ? ` · ${money.ar.overdueCount} late` : ""
            } · right now`,
            icon: TrendingUp,
            tone: "danger" as const,
            href: "/invoices?status=unpaid",
            primary: true,
          },
        ]
      : []),

    // Shown to every role: keeping a promise is not a money question.
    {
      label: "Repairs ready on time",
      value: onTime.pct === null ? "—" : `${onTime.pct}%`,
      hint:
        onTime.withDue === 0
          ? "no finished repairs had a promised date yet"
          : `${onTime.onTime} of ${onTime.withDue} were ready by the promised day`,
      icon: CalendarCheck,
      tone: "ready" as const,
      href: "/tickets?due=overdue",
      primary: true,
    },

    // The work figures fill the headline row for a technician. They are
    // already computed for the charts below, so this costs no queries.
    ...(money
      ? []
      : [
          {
            label: "Repairs taken in",
            value: String(throughput.created),
            hint: `between ${period.rangeLabel}`,
            icon: ICONS.ticket,
            tone: "info" as const,
            href: "/tickets?status=all",
            primary: true,
          },
          {
            label: "Repairs finished",
            value: String(throughput.resolved),
            hint:
              throughput.created - throughput.resolved > 0
                ? `${throughput.created - throughput.resolved} more came in than went back out`
                : "the bench kept up with the counter",
            icon: CircleCheckBig,
            tone: "success" as const,
            href: "/tickets?status=Resolved",
            primary: true,
          },
          {
            label: "Typical time to fix",
            value:
              resolveTime.count === 0 ? "—" : formatDuration(resolveTime.medianMs),
            hint:
              resolveTime.count === 0
                ? "nothing finished in this period"
                : `across ${resolveTime.count} finished repair${
                    resolveTime.count === 1 ? "" : "s"
                  }`,
            icon: Timer,
            tone: "active" as const,
            primary: true,
          },
        ]),
  ];

  // ------------------------------------------------------------ the cards
  // Built once and arranged twice: Easy mode shows the few a shop owner reads
  // every day and keeps the rest one tap away under "More detail"; Full mode
  // lays everything out as before.

  const revenueCard = money ? (
    <ReportCard
      title="Money in"
      description={`Payments taken, by ${grainWord}.`}
      className="lg:col-span-2"
      action={
        canExport ? (
          <CardLink href={`/api/exports/reports-revenue.csv${range}`} download>
            <ACTIONS.download className="size-4" />
            Export CSV
          </CardLink>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1">
        <span className="rf-num text-[30px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {formatCents(money.netRevenueCents)}
        </span>
        <span className="text-[14px] text-muted-foreground">
          {`${formatCents(money.revenueCents)} from ${money.paymentCount} payment${
            money.paymentCount === 1 ? "" : "s"
          }, less ${formatCents(money.refundCents)} refunded · ${period.rangeLabel}`}
        </span>
      </div>
      <ColumnChart
        caption={`Money in by ${grainWord}`}
        series={[{ key: "revenue", label: "Taken", className: "bg-accent" }]}
        rows={money.revenueByBucket.map((point) => ({
          label: point.label,
          fullLabel: point.fullLabel,
          values: [point.value],
        }))}
        format={(value) => (showValues ? compactCents(value) : formatCents(value))}
        showValues={showValues}
      />
    </ReportCard>
  ) : null;

  const methodsCard = money ? (
    <ReportCard title="How people paid" description="Card, cash and the rest, in this period.">
      {money.byMethod.length === 0 ? (
        <EmptyState
          icon={ICONS.deposit}
          title="No payments yet"
          hint="Nothing was taken in this period."
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
  ) : null;

  const invoicesCard = money ? (
    <ReportCard
      title="Invoices written and paid"
      description="Bills written in this period, and bills paid in full."
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
            label: "Written",
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
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        {formatCents(money.invoices.raisedCents)} billed ·{" "}
        {formatCents(money.invoices.paidCents)} paid in full. Voided invoices
        are left out of both.
      </p>
    </ReportCard>
  ) : null;

  const throughputCard = (
    <ReportCard
      title="Repairs in and out"
      description={`Repairs taken in and finished, by ${grainWord}.`}
      className="lg:col-span-2"
      action={
        canExport ? (
          <CardLink href={`/api/exports/reports-tickets.csv${range}`} download>
            <ACTIONS.download className="size-4" />
            Export CSV
          </CardLink>
        ) : (
          <CardLink href="/tickets?status=all">All repairs</CardLink>
        )
      }
    >
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Figure label="Taken in" value={String(throughput.created)} tint="text-status-new-fg" />
        <Figure label="Finished" value={String(throughput.resolved)} tint="text-status-resolved-fg" />
        <Figure
          label="Still on the bench"
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
        caption={`Repairs taken in and finished by ${grainWord}`}
        series={throughputSeries}
        rows={throughput.byBucket.map((point) => ({
          label: point.label,
          fullLabel: point.fullLabel,
          values: [point.created, point.resolved],
        }))}
        format={(value) => String(value)}
      />
    </ReportCard>
  );

  const resolveCard = (
    <ReportCard
      title="Time to fix"
      description="From check-in to finished, for repairs finished in this period."
    >
      {resolveTime.count === 0 ? (
        <EmptyState
          icon={Timer}
          title="Nothing finished yet"
          hint="Finish a repair and how long it took shows here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Figure label="Typical" value={formatDuration(resolveTime.medianMs)} big />
            <Figure label="Average" value={formatDuration(resolveTime.meanMs)} big />
          </div>
          <dl className="flex flex-col gap-2 border-t border-border pt-4 text-[14px]">
            <Row label="Quickest" value={formatDuration(resolveTime.fastestMs)} />
            <Row label="Longest" value={formatDuration(resolveTime.slowestMs)} />
            <Row label="Repairs counted" value={String(resolveTime.count)} />
          </dl>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Typical is the middle repair. One laptop waiting three weeks for a
            part pulls the average up, but not the typical time.
          </p>
        </>
      )}
    </ReportCard>
  );

  const productsCard = money ? (
    <ReportCard
      title="Best-selling products"
      description="Billed on invoices written in this period."
      action={
        canExport ? (
          <CardLink href={`/api/exports/reports-products.csv${range}`} download>
            <ACTIONS.download className="size-4" />
            Export CSV
          </CardLink>
        ) : undefined
      }
    >
      {money.topProducts.length === 0 ? (
        <EmptyState
          icon={ICONS.reports}
          title="No products sold yet"
          hint="Put a product from your stock on an invoice and it shows here."
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
  ) : null;

  const refundsCard = money ? (
    <ReportCard title="Refunds" description="Money given back in this period.">
      {money.refunds.length === 0 ? (
        <EmptyState
          icon={ACTIONS.refund}
          title="No refunds"
          hint="Nothing was given back in this period."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {money.refunds.map((refund) => (
            <li key={refund.id}>
              <Link
                href={`/invoices/${refund.invoiceId}`}
                className="flex min-h-12 items-start justify-between gap-3 rounded-lg py-3 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-foreground">
                    {refund.customerName}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    Invoice #{refund.invoiceNumber} · {refund.methodLabel}
                    {refund.reason ? ` · ${refund.reason}` : ""}
                  </span>
                </span>
                <span className="rf-num shrink-0 text-[14px] font-semibold text-destructive">
                  −{formatCents(refund.amountCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  ) : null;

  const leaderboardCard = (
    <ReportCard
      title="Who fixed what"
      description="Repairs finished and hours logged in this period."
      className={money ? undefined : "lg:col-span-2"}
      action={
        canExport ? (
          <CardLink href={`/api/exports/reports-tech.csv${range}`} download>
            <ACTIONS.download className="size-4" />
            Export CSV
          </CardLink>
        ) : undefined
      }
    >
      {leaderboard.length === 0 ? (
        <EmptyState
          icon={ICONS.team}
          title="No work logged yet"
          hint="Finished repairs and stopped timers show up here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {leaderboard.map((row, index) => (
            <li key={row.userId} className="flex min-h-12 items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className={cn(
                  "rf-num flex size-8 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold",
                  index === 0
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-hover text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
                {row.name}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-semibold tabular-nums text-muted-foreground">
                <ICONS.ticket className="size-4" aria-hidden />
                {row.resolved}
                <span className="sr-only"> repairs finished</span>
              </span>
              <span className="flex w-20 shrink-0 items-center justify-end gap-1.5 text-[14px] font-semibold tabular-nums text-muted-foreground">
                <Clock className="size-4" aria-hidden />
                {formatHours(row.seconds)}
                <span className="sr-only"> logged</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );

  const techNote = !canSeeMoney ? (
    <p className="text-[14px] text-muted-foreground">
      Money figures are for owners and the front desk.{" "}
      <Link href="/tickets" className="font-semibold text-accent hover:underline">
        Go to repairs
      </Link>
    </p>
  ) : null;

  const header = (
    <PageHeader
      title="Reports"
      description={`${period.label} · ${period.rangeLabel}${location ? ` · ${location.name}` : ""}`}
      actions={
        canExport ? (
          <Button variant="outline" asChild className={simple ? "h-12 px-5 text-base" : undefined}>
            <a href="/api/exports/customers.csv">
              <ACTIONS.download />
              Customers CSV
            </a>
          </Button>
        ) : undefined
      }
    />
  );

  // ============================================================== Easy mode
  if (simple) {
    const primaryKpis = kpis.filter((kpi) => kpi.primary);
    const otherKpis = kpis.filter((kpi) => !kpi.primary);
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {header}

        <div className="flex flex-col gap-3">
          <PeriodPills active={period.key} location={location?.id} />
          <DateRangeForm period={period} location={location?.id} simple />
        </div>

        <section aria-label="The main numbers" className="flex flex-col gap-3">
          <div
            className={cn(
              "grid grid-cols-1 gap-3 sm:grid-cols-2",
              primaryKpis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
            )}
          >
            {primaryKpis.map((kpi) => tile(kpi, "large"))}
          </div>
          {otherKpis.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {otherKpis.map((kpi) => tile(kpi, "small"))}
            </div>
          ) : null}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          {money ? (
            <>
              {revenueCard}
              {methodsCard}
              {refundsCard}
            </>
          ) : (
            <>
              {throughputCard}
              {resolveCard}
            </>
          )}
        </div>

        {/* Easy ends here. Everything else on this page is one tap away, so
            nothing is lost, but it does not crowd the numbers above. */}
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="text-base font-semibold text-foreground">That&rsquo;s the main numbers</span>
              <span className="text-[14px] text-muted-foreground">
                {money
                  ? "More detail: invoices, repairs in and out, time to fix, best sellers and who fixed what."
                  : "More detail: who fixed what."}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border-strong px-4 py-2.5 text-[15px] font-semibold">
              <span className="group-open:hidden">Show more</span>
              <span className="hidden group-open:inline">Show less</span>
            </span>
          </summary>
          <div className="grid items-start gap-5 border-t border-border p-4 sm:p-5 lg:grid-cols-2">
            {money ? (
              <>
                {invoicesCard}
                {resolveCard}
                {throughputCard}
                {productsCard}
                {leaderboardCard}
              </>
            ) : (
              leaderboardCard
            )}
          </div>
        </details>

        {techNote}
      </div>
    );
  }

  // ============================================================== Full mode
  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PeriodPills active={period.key} location={location?.id} />
        <DateRangeForm period={period} location={location?.id} />
      </div>

      {/* Seven tiles for a money-viewer, four for a technician: the work
          figures carry the headline row when the money ones are withheld. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          money ? "lg:grid-cols-3 xl:grid-cols-4" : "lg:grid-cols-4",
        )}
      >
        {kpis.map((kpi) => tile(kpi, "stat"))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {revenueCard}
        {methodsCard}
        {invoicesCard}
        {throughputCard}
        {resolveCard}
        {productsCard}
        {refundsCard}
        {leaderboardCard}
      </div>

      {techNote}
    </div>
  );
}

type Kpi = KpiTileProps & { primary?: boolean };

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
  /*
   * Label above figure, same as `StatTile` on the dashboard. Reports had it
   * the other way round, so the same number read in two different orders
   * depending on which screen you were on.
   */
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "rf-num font-semibold leading-none tracking-[-0.02em] text-foreground",
          big ? "text-[24px]" : "text-[22px]",
          tint,
        )}
      >
        {value}
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
