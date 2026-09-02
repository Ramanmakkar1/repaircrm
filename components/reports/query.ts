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

export type MoneyReport = {
  revenueCents: number;
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

/**
 * Did the work land when it was promised?
 *
 * Only tickets resolved in the period that HAD a due date can answer, so
 * `withDue` is reported alongside the percentage — "100% of 2" is not the same
 * claim as "100% of 200".
 */
export type OnTimeReport = {
  onTime: number;
  withDue: number;
  /** 0-100, rounded. Null when nothing in the period carried a due date. */
  pct: number | null;
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
  onTime: OnTimeReport;
  resolveTime: ResolveTimeReport;
  leaderboard: LeaderboardRow[];
};

export async function loadReport(
  shopId: string,
  period: ReportPeriod,
  options: {
    includeMoney: boolean;
    /**
     * One branch, or null/"all" for the whole shop. Applied to tickets and
     * invoices; payments follow their invoice's branch.
     */
    location?: string | null;
  },
): Promise<ReportData> {
  const inPeriod = { gte: period.from, lt: period.toExclusive };
  const branch =
    options.location && options.location !== "all"
      ? { locationId: options.location }
      : {};

  const [work, money] = await Promise.all([
    loadWork(shopId, period, inPeriod, branch),
    options.includeMoney
      ? loadMoney(shopId, period, inPeriod, branch)
      : Promise.resolve(null),
  ]);

  return { ...work, money };
}

/** The branch narrowing, as the two `where` shapes the queries below need. */
type Branch = { locationId?: string };

// ---------------------------------------------------------------------------
// Work: throughput, time-to-resolve, tech leaderboard
// ---------------------------------------------------------------------------

async function loadWork(
  shopId: string,
  period: ReportPeriod,
  inPeriod: { gte: Date; lt: Date },
  branch: Branch,
): Promise<Omit<ReportData, "money">> {
  const [created, resolved, timeGroups, members] = await Promise.all([
    db.ticket.findMany({
      where: { shopId, ...branch, createdAt: inPeriod },
      select: { createdAt: true },
    }),
    db.ticket.findMany({
      where: { shopId, ...branch, resolvedAt: inPeriod },
      select: {
        createdAt: true,
        resolvedAt: true,
        dueDate: true,
        assignedToId: true,
      },
    }),
    // `seconds` is only set once an entry is stopped; a running timer sums as
    // null and is therefore excluded, which is the honest reading of "hours
    // logged" — the work is not logged until it is stopped.
    db.timeEntry.groupBy({
      by: ["userId"],
      where: {
        shopId,
        startedAt: inPeriod,
        ...(branch.locationId ? { ticket: { locationId: branch.locationId } } : {}),
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
  let onTimeCount = 0;
  let withDueCount = 0;

  for (const ticket of resolved) {
    if (!ticket.resolvedAt) continue;

    // On time = closed at or before the date the customer was given. Tickets
    // with no due date are not counted either way — there was no promise to
    // keep, and scoring them would flatter (or damn) the number for free.
    if (ticket.dueDate) {
      withDueCount += 1;
      if (ticket.resolvedAt.getTime() <= ticket.dueDate.getTime()) {
        onTimeCount += 1;
      }
    }
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
    onTime: {
      onTime: onTimeCount,
      withDue: withDueCount,
      pct: withDueCount === 0 ? null : Math.round((onTimeCount / withDueCount) * 100),
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
  branch: Branch,
): Promise<MoneyReport> {
  // Payments have no branch of their own — they belong to the branch that
  // raised the invoice.
  const paymentBranch = branch.locationId
    ? { invoice: { locationId: branch.locationId } }
    : {};
  const [payments, methodGroups, raisedRows, paidRows, productLines, owing] =
    await Promise.all([
      db.payment.findMany({
        where: { shopId, ...paymentBranch, createdAt: inPeriod },
        select: { amountCents: true, createdAt: true },
      }),
      db.payment.groupBy({
        by: ["method"],
        where: { shopId, ...paymentBranch, createdAt: inPeriod },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      // Void invoices are excluded everywhere: a voided document is not a
      // thing that was billed, it is a thing that was un-billed.
      db.invoice.findMany({
        where: { shopId, ...branch, createdAt: inPeriod, status: { not: "VOID" } },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        },
      }),
      db.invoice.findMany({
        where: { shopId, ...branch, paidAt: inPeriod, status: { not: "VOID" } },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        },
      }),
      db.invoiceLine.findMany({
        where: {
          productId: { not: null },
          invoice: { shopId, ...branch, createdAt: inPeriod, status: { not: "VOID" } },
        },
        select: {
          quantity: true,
          unitPriceCents: true,
          product: { select: { name: true } },
        },
      }),
      db.invoice.findMany({
        where: { shopId, ...branch, status: { in: [...OWING_STATUSES] } },
        select: {
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
        },
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

  return {
    revenueCents,
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
