import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const { resolveReportPeriod, bucketIndex } = await import("@/components/reports/period");
const { loadReport } = await import("@/components/reports/query");
const { resolvePeriod } = await import("@/components/statements/period");
const { formatDate, formatDateTime, isOverdue } = await import("@/components/billing/format");
const { termsLabel } = await import("@/components/billing/print-chrome");
const { shopDayRange, shopNow, shopWall, shopTodayKey, daysBetweenKeys } = await import("@/components/billing/shop-clock");
const { summariseOwed } = await import("@/lib/dashboard/logic");
const { todayWindow } = await import("@/lib/dashboard/money");

/**
 * Money screens count the shop's own days (Shop.timezone), not the server's.
 *
 * "Now" is 21:10 on Saturday 3 October 2026 in Edmonton, which is already
 * 03:10 on Sunday the 4th in UTC: the moment an owner checks the day's takings
 * at closing time.
 */

const ZONE = "America/Edmonton";
const SATURDAY_9PM = new Date(Date.UTC(2026, 9, 4, 3, 10));

describe("Reports days are the shop's days", () => {
  it("a one-day report is the shop's Saturday, the same window as the Shop overview's today", () => {
    const period = resolveReportPeriod({ period: "custom", from: "2026-10-03", to: "2026-10-03" }, SATURDAY_9PM, ZONE);
    expect(period.from.toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(period.toExclusive.toISOString()).toBe("2026-10-04T06:00:00.000Z");
    const today = todayWindow(SATURDAY_9PM.getTime(), ZONE);
    expect(today.key).toBe("2026-10-03");
    expect(period.from.getTime()).toBe(today.from);
    expect(period.toExclusive.getTime()).toBe(today.toExclusive);
  });

  it("counts a 9pm Saturday sale on Saturday, not on the UTC Sunday", () => {
    const sale = new Date(Date.UTC(2026, 9, 4, 3, 0)); // 21:00 Saturday in Edmonton
    const saturday = resolveReportPeriod({ period: "custom", from: "2026-10-03", to: "2026-10-03" }, SATURDAY_9PM, ZONE);
    expect(sale >= saturday.from && sale < saturday.toExclusive).toBe(true);
    // On UTC days (the old behaviour) it fell on Sunday.
    const utc = resolveReportPeriod({ period: "custom", from: "2026-10-03", to: "2026-10-03" }, SATURDAY_9PM);
    expect(sale >= utc.from && sale < utc.toExclusive).toBe(false);
  });

  it("'This month' is the shop's month on the evening of the 31st, and ends tonight at the shop's midnight", () => {
    const halloweenNight = new Date(Date.UTC(2026, 10, 1, 4, 0)); // 22:00 Oct 31 in Edmonton
    const period = resolveReportPeriod({ period: "this-month" }, halloweenNight, ZONE);
    expect(period.fromValue).toBe("2026-10-01");
    expect(period.toValue).toBe("2026-10-31");
    expect(period.toExclusive.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });

  it("cuts every column at the shop's midnight too", () => {
    const period = resolveReportPeriod({ period: "this-month" }, SATURDAY_9PM, ZONE);
    expect(period.buckets[0].from.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    const lateSaturday = new Date(Date.UTC(2026, 9, 4, 3, 0));
    expect(bucketIndex(period.buckets, lateSaturday)).toBe(0);
  });

  it("without a zone is exactly what it always was (UTC days)", () => {
    const period = resolveReportPeriod({ period: "custom", from: "2026-10-03", to: "2026-10-03" }, SATURDAY_9PM);
    expect(period.from.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(period.toExclusive.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("statements, dates and terms on the shop's clock", () => {
  it("a statement's last 90 days end on the shop's today, cut at its midnight", () => {
    const period = resolvePeriod(undefined, undefined, SATURDAY_9PM, ZONE);
    expect(period.toValue).toBe("2026-10-03");
    expect(period.toExclusive.toISOString()).toBe("2026-10-04T06:00:00.000Z");
    expect(period.startsAt.toISOString()).toBe(`${period.fromValue}T06:00:00.000Z`);
    expect(period.presetDays).toBe(90);
  });

  it("prints an instant in the shop's zone and a calendar day as stored", () => {
    expect(formatDate(SATURDAY_9PM, ZONE)).toBe("Oct 3, 2026");
    expect(formatDate(SATURDAY_9PM)).toBe("Oct 4, 2026");
    expect(formatDateTime(SATURDAY_9PM, ZONE)).toBe("Oct 3, 2026, 9:10 PM");
    // A due date is a calendar day at UTC midnight: no zone, no shift.
    expect(formatDate(new Date("2026-10-17T00:00:00.000Z"))).toBe("Oct 17, 2026");
  });

  it("counts the terms from the shop's issue day, in plain words", () => {
    const due = new Date("2026-10-17T00:00:00.000Z");
    expect(termsLabel(SATURDAY_9PM, due, ZONE)).toBe("Pay within 14 days");
    expect(termsLabel(SATURDAY_9PM, null, ZONE)).toBe("Due on receipt");
    expect(termsLabel(SATURDAY_9PM, new Date("2026-10-04T00:00:00.000Z"), ZONE)).toBe("Pay within 1 day");
  });

  it("is not late on its due day until the shop's due day has started", () => {
    const due = new Date("2026-10-04T00:00:00.000Z"); // due Sunday the 4th
    // 21:10 Saturday in the shop: not yet the due day, though UTC says it is.
    expect(isOverdue(due, 1_000, shopNow(SATURDAY_9PM.getTime(), ZONE))).toBe(false);
    expect(isOverdue(due, 1_000, SATURDAY_9PM.getTime())).toBe(true);
  });

  it("moves an instant onto the wall clock for display maths only", () => {
    expect(shopWall(SATURDAY_9PM, ZONE)?.toISOString()).toBe("2026-10-03T21:10:00.000Z");
    expect(shopWall(null, ZONE)).toBeNull();
    expect(shopTodayKey(SATURDAY_9PM.getTime(), ZONE)).toBe("2026-10-03");
    expect(shopDayRange("2026-11-01", "2026-11-01", ZONE).toExclusive.getTime() - shopDayRange("2026-11-01", "2026-11-01", ZONE).from.getTime()).toBe(25 * 3_600_000);
    expect(daysBetweenKeys("2026-10-03", "2026-10-17")).toBe(14);
  });
});

describe("'Owed to you' on Reports is the Shop overview's own number", () => {
  const owedRow = (id: string, cents: number, extra: Partial<{ payments: { amountCents: number }[]; refunds: { amountCents: number; status: string }[]; dueDate: Date | null }> = {}) => ({
    id,
    number: 1000,
    dueDate: extra.dueDate ?? null,
    taxRateBps: 0,
    customer: { id: "c1", firstName: "Owen", lastName: "Fitzgerald", businessName: null, phone: null, mobile: null },
    lines: [{ quantity: 1, unitPriceCents: cents, taxable: false }],
    payments: extra.payments ?? [],
    refunds: extra.refunds ?? [],
  });

  beforeEach(() => {
    resetDb();
    handlers["ticket.findMany"] = () => [];
    handlers["timeEntry.groupBy"] = () => [];
    handlers["user.findMany"] = () => [];
    handlers["payment.findMany"] = () => [];
    handlers["payment.groupBy"] = () => [];
    handlers["invoiceLine.findMany"] = () => [];
    handlers["refund.findMany"] = () => [];
    handlers["deposit.findMany"] = () => [];
    handlers["invoice.findMany"] = (args) => {
      const where = args.where as { status?: { in?: string[] } };
      // The owed loader asks for sent and part-paid invoices; the period queries ask for the rest.
      if (where.status?.in) {
        return [
          owedRow("a", 10_000),
          // Paid, then $27.05 refunded: owes $27.05 again (the old Reports query missed this).
          owedRow("b", 5_410, { payments: [{ amountCents: 5_410 }], refunds: [{ amountCents: 2_705, status: "completed" }] }),
          // Overpaid: never cancels another invoice's debt.
          owedRow("c", 1_000, { payments: [{ amountCents: 1_500 }] }),
        ];
      }
      return [];
    };
  });

  it("counts refunds and matches summariseOwed to the cent", async () => {
    const period = resolveReportPeriod({ period: "this-month" }, SATURDAY_9PM, ZONE);
    const report = await loadReport("shop_1", period, { includeMoney: true });
    expect(report.money?.ar.totalCents).toBe(10_000 + 2_705);
    expect(report.money?.ar.count).toBe(2);
    // Every money query carries the shop.
    const owedQuery = callsTo("invoice.findMany").find((call) => (call.args.where as { status?: { in?: string[] } }).status?.in);
    expect(owedQuery?.args.where).toMatchObject({ shopId: "shop_1", status: { in: ["SENT", "PARTIAL"] } });
    expect(summariseOwed([], 0).totalCents).toBe(0);
  });

  it("never runs a money query for a technician", async () => {
    const period = resolveReportPeriod({ period: "this-month" }, SATURDAY_9PM, ZONE);
    const report = await loadReport("shop_1", period, { includeMoney: false });
    expect(report.money).toBeNull();
    expect(callsTo("payment.findMany")).toEqual([]);
  });
});
