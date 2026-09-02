import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/components/statements/query";
import { bucketIndex, type ReportPeriod } from "./period";

/**
 * Server-only loader behind /reports. Never import this from a Client
 * Component — it pulls in Prisma.
 *
 * RULES OF THIS FILE
 *  1. Every query is scoped by the session's `shopId` (see lib/db.ts).
 *  2. Every query is bounded by the period. The one deliberate exception is
 *     outstanding A/R, which is a *right now* number — an unpaid invoice from
 *     March is still money owed in August, so period-scoping it would report a
 *     debt that does not exist.
 *  3. Money is loaded only when the caller says the viewer may see it. A
 *     technician's report simply never runs those queries, rather than running
 *     them and hiding the result in the markup.
 *
 * Aggregation happens in Prisma where the shape allows (groupBy / aggregate)
 * and in JS where it does not — bucketing by week and totalling invoices from
 * their lines both need per-row work, and both are bounded by the period, so
 * the row counts stay in the hundreds for a real shop.
 */

/** Invoice statuses that can still carry a balance the customer owes. */
const OWING_STATUSES = ["SENT", "PARTIAL"] as const;

const TOP_PRODUCT_LIMIT = 8;

export type SeriesPoint = { label: string; fullLabel: string; value: number };

export type TwoSeriesPoint = {
  label: string;
  fullLabel: string;
  created: number;
  resolved: number;
};

export type RefundRow = {
  id: string;
  invoiceId: string;
  invoiceNumber: number;
  customerName: string;
  amountCents: number;
  method: string;
  methodLabel: string;
  reason: string | null;
  createdAt: Date;
};

export type MoneyReport = {
  /** Everything collected in the period, before anything went back out. */
  revenueCents: number;
  /** Collected minus refunded — the money the shop actually kept. */
  netRevenueCents: number;
  refundCents: number;
  refundCount: number;
  refunds: RefundRow[];
  /**
   * Deposits taken and neither applied nor refunded, as of RIGHT NOW. A
   * liability, not income: it is the customer's money the shop is holding.
   */
  depositsHeldCents: number;
  depositsHeldCount: number;
  paymentCount: number;
  /** Payments collected, cut into the period's buckets. */
  revenueByBucket: SeriesPoint[];
  byMethod: { method: string; label: string; cents: number; count: number }[];
  invoices: {
    raised: number;
    raisedCents: number;
    /** Invoices *marked paid* in the period, whenever they were raised. */
    paid: number;
    paidCents: number;
  };
  topProducts: { name: string; cents: number; quantity: number }[];
  /** As of right now, not period-scoped — see the rules above. */
  ar: { totalCents: number; count: number };
};

export type ThroughputReport = {
  created: number;
  resolved: number;
  byBucket: TwoSeriesPoint[];
};

export type ResolveTimeReport = {
  count: number;
  meanMs: number;
  medianMs: number;
  fastestMs: number;
  slowestMs: number;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  resolved: number;
  seconds: number;
};

export type ReportData = {
  /** null when the viewer is a technician — the queries never ran. */
  money: MoneyReport | null;
  throughput: ThroughputReport;
  resolveTime: ResolveTimeReport;
  leaderboard: LeaderboardRow[];
};

export async function loadReport(
  shopId: string,
  period: ReportPeriod,
  options: { includeMoney: boolean; locationId?: string | null },
): Promise<ReportData> {
  const inPeriod = { gte: period.from, lt: period.toExclusive };
  // Null means "every location", which is the whole shop and therefore no
  // filter at all — `locationId: undefined` is how Prisma spells that.
  const locationId = options.locationId ?? undefined;

  const [work, money] = await Promise.all([
    loadWork(shopId, period, inPeriod, locationId),
    options.includeMoney
      ? loadMoney(shopId, period, inPeriod, locationId)
      : Promise.resolve(null),
  ]);

  return { ...work, money };
}

// ---------------------------------------------------------------------------
// Work: throughput, time-to-resolve, tech leaderboard
// ---------------------------------------------------------------------------

async function loadWork(
  shopId: string,
  period: ReportPeriod,
  inPeriod: { gte: Date; lt: Date },
  locationId: string | undefined,
): Promise<Omit<ReportData, "money">> {
  const [created, resolved, timeGroups, members] = await Promise.all([
    db.ticket.findMany({
      where: { shopId, createdAt: inPeriod, locationId },
      select: { createdAt: true },
    }),
    db.ticket.findMany({
      where: { shopId, resolvedAt: inPeriod, locationId },
      select: { createdAt: true, resolvedAt: true, assignedToId: true },
    }),
    // `seconds` is only set once an entry is stopped; a running timer sums as
    // null and is therefore excluded, which is the honest reading of "hours
    // logged" — the work is not logged until it is stopped.
    db.timeEntry.groupBy({
      by: ["userId"],
      // A time entry has no location of its own — its ticket does.
      where: {
        shopId,
        startedAt: inPeriod,
        ...(locationId ? { ticket: { locationId } } : {}),
      },
      _sum: { seconds: true },
    }),
    db.user.findMany({
      where: { shopId },
      select: { id: true, name: true, role: true, active: true },
    }),
  ]);

  const buckets = period.buckets.map((bucket) => ({
    label: bucket.label,
    fullLabel: bucket.fullLabel,
    created: 0,
    resolved: 0,
  }));

  for (const ticket of created) {
    const index = bucketIndex(period.buckets, ticket.createdAt);
    if (index >= 0) buckets[index].created += 1;
  }

  const durations: number[] = [];
  const resolvedByUser = new Map<string, number>();

  for (const ticket of resolved) {
    if (!ticket.resolvedAt) continue;
    const index = bucketIndex(period.buckets, ticket.resolvedAt);
    if (index >= 0) buckets[index].resolved += 1;

    const ms = ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
    // A negative span means the data is wrong (a back-dated resolve); counting
    // it would drag the mean below zero and make the card look broken.
    if (ms >= 0) durations.push(ms);

    if (ticket.assignedToId) {
      resolvedByUser.set(
        ticket.assignedToId,
        (resolvedByUser.get(ticket.assignedToId) ?? 0) + 1,
      );
    }
  }

  const secondsByUser = new Map(
    timeGroups.map((group) => [group.userId, group._sum.seconds ?? 0]),
  );

  const leaderboard: LeaderboardRow[] = members
    .map((member) => ({
      userId: member.id,
      name: member.name,
      resolved: resolvedByUser.get(member.id) ?? 0,
      seconds: secondsByUser.get(member.id) ?? 0,
    }))
    // Everyone who did something in the period, plus every active tech even at
    // zero — an empty row is a fact worth seeing on a leaderboard.
    .filter((row) => row.resolved > 0 || row.seconds > 0)
    .sort((a, b) => b.resolved - a.resolved || b.seconds - a.seconds);

  return {
    throughput: {
      created: created.length,
      resolved: resolved.length,
      byBucket: buckets,
    },
    resolveTime: summarise(durations),
    leaderboard,
  };
}

function summarise(durations: number[]): ResolveTimeReport {
  if (durations.length === 0) {
    return { count: 0, meanMs: 0, medianMs: 0, fastestMs: 0, slowestMs: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, ms) => sum + ms, 0);
  const middle = Math.floor(sorted.length / 2);

  return {
    count: sorted.length,
    meanMs: Math.round(total / sorted.length),
    medianMs:
      sorted.length % 2 === 0
        ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
        : sorted[middle],
    fastestMs: sorted[0],
    slowestMs: sorted[sorted.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Money: revenue, methods, invoices, products, A/R
// ---------------------------------------------------------------------------

async function loadMoney(
  shopId: string,
  period: ReportPeriod,
  inPeriod: { gte: Date; lt: Date },
  locationId: string | undefined,
): Promise<MoneyReport> {
  // A payment, a refund and a deposit all belong to a location through their
  // parent document, so the filter travels one relation deep.
  const viaInvoice = locationId ? { invoice: { locationId } } : {};

  const [
    payments,
    methodGroups,
    raisedRows,
    paidRows,
    productLines,
    owing,
    refundRows,
    depositRows,
  ] = await Promise.all([
      db.payment.findMany({
        where: { shopId, createdAt: inPeriod, ...viaInvoice },
        select: { amountCents: true, createdAt: true },
      }),
      db.payment.groupBy({
        by: ["method"],
        where: { shopId, createdAt: inPeriod, ...viaInvoice },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      // Void invoices are excluded everywhere: a voided document is not a
      // thing that was billed, it is a thing that was un-billed.
      db.invoice.findMany({
        where: { shopId, createdAt: inPeriod, status: { not: "VOID" }, locationId },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        },
      }),
      db.invoice.findMany({
        where: { shopId, paidAt: inPeriod, status: { not: "VOID" }, locationId },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        },
      }),
      db.invoiceLine.findMany({
        where: {
          productId: { not: null },
          invoice: { shopId, createdAt: inPeriod, status: { not: "VOID" }, locationId },
        },
        select: {
          quantity: true,
          unitPriceCents: true,
          product: { select: { name: true } },
        },
      }),
      db.invoice.findMany({
        where: { shopId, status: { in: [...OWING_STATUSES] }, locationId },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
        },
      }),
      // Money handed back in the period. Its own table, never a negative
      // payment, so "collected" and "returned" stay separately reportable.
      db.refund.findMany({
        where: { shopId, createdAt: inPeriod, ...viaInvoice },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          method: true,
          reason: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              number: true,
              customer: {
                select: { firstName: true, lastName: true, businessName: true },
              },
            },
          },
        },
      }),
      // NOT period-scoped, same reasoning as A/R: a deposit taken in March is
      // still the customer's money today. It is a standing liability, not
      // income, so it is reported as of right now.
      db.deposit.findMany({
        where: {
          shopId,
          appliedInvoiceId: null,
          refundedAt: null,
          ...(locationId ? { ticket: { locationId } } : {}),
        },
        select: { amountCents: true },
      }),
    ]);

  const revenueByBucket: SeriesPoint[] = period.buckets.map((bucket) => ({
    label: bucket.label,
    fullLabel: bucket.fullLabel,
    value: 0,
  }));

  let revenueCents = 0;
  for (const payment of payments) {
    revenueCents += payment.amountCents;
    const index = bucketIndex(period.buckets, payment.createdAt);
    if (index >= 0) revenueByBucket[index].value += payment.amountCents;
  }

  const byMethod = methodGroups
    .map((group) => ({
      method: group.method,
      label: PAYMENT_METHOD_LABELS[group.method] ?? group.method,
      cents: group._sum.amountCents ?? 0,
      count: group._count._all,
    }))
    .sort((a, b) => b.cents - a.cents);

  const sumTotals = (
    rows: { taxRateBps: number; lines: { quantity: number; unitPriceCents: number; taxable: boolean }[] }[],
  ) =>
    rows.reduce(
      (sum, row) => sum + invoiceTotals(row.lines, row.taxRateBps).totalCents,
      0,
    );

  const products = new Map<string, { cents: number; quantity: number }>();
  for (const line of productLines) {
    const name = line.product?.name ?? "Unnamed product";
    const entry = products.get(name) ?? { cents: 0, quantity: 0 };
    entry.cents += line.quantity * line.unitPriceCents;
    entry.quantity += line.quantity;
    products.set(name, entry);
  }

  const topProducts = [...products.entries()]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, TOP_PRODUCT_LIMIT);

  // Overpayment on one invoice does not cancel a debt on another, so each
  // balance is floored at zero before summing.
  let arTotalCents = 0;
  let arCount = 0;
  for (const invoice of owing) {
    const { balanceCents } = invoiceTotals(
      invoice.lines,
      invoice.taxRateBps,
      invoice.payments,
    );
    if (balanceCents > 0) {
      arTotalCents += balanceCents;
      arCount += 1;
    }
  }

  const refundCents = refundRows.reduce((sum, row) => sum + row.amountCents, 0);
  const refunds: RefundRow[] = refundRows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice.id,
    invoiceNumber: row.invoice.number,
    customerName:
      row.invoice.customer.businessName ||
      `${row.invoice.customer.firstName} ${row.invoice.customer.lastName}`.trim(),
    amountCents: row.amountCents,
    method: row.method,
    methodLabel: PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    reason: row.reason,
    createdAt: row.createdAt,
  }));

  const depositsHeldCents = depositRows.reduce(
    (sum, row) => sum + row.amountCents,
    0,
  );

  return {
    revenueCents,
    netRevenueCents: revenueCents - refundCents,
    refundCents,
    refundCount: refundRows.length,
    refunds,
    depositsHeldCents,
    depositsHeldCount: depositRows.length,
    paymentCount: payments.length,
    revenueByBucket,
    byMethod,
    invoices: {
      raised: raisedRows.length,
      raisedCents: sumTotals(raisedRows),
      paid: paidRows.length,
      paidCents: sumTotals(paidRows),
    },
    topProducts,
    ar: { totalCents: arTotalCents, count: arCount },
  };
}
