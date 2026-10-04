import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";
import { receiptSummary } from "@/components/billing/receipt-math";
import { resolveReportPeriod, bucketIndex } from "@/components/reports/period";
import { shopDayRange } from "@/components/billing/shop-clock";
import { dueTodayRange } from "@/lib/sla";

vi.mock("@/lib/db", () => ({ db: fakeClient }));
const { loadReport } = await import("@/components/reports/query");
const { loadTakingsRows } = await import("@/lib/dashboard/money");
const { reportScope } = await import("@/app/api/exports/_lib/report-range");

const lines = [{ quantity: 1, unitPriceCents: 10000, taxable: false }];
const at = new Date("2026-10-04T03:00:00Z");
const zone = "America/Edmonton";

describe("independent fix-list verification: money and shop dates", () => {
  beforeEach(() => {
    resetDb();
    for (const path of ["ticket.findMany", "timeEntry.groupBy", "user.findMany", "payment.groupBy", "invoice.findMany", "invoiceLine.findMany", "deposit.findMany", "refund.findMany", "payment.findMany"]) handlers[path] = () => [];
    handlers["shop.findUnique"] = () => ({ timezone: zone });
  });

  it.each([
    ["completed", 2000], ["pending", 2000], ["failed", 0],
  ])("receipt accounts for a %s refund", (status, expected) => {
    const summary = receiptSummary({ lines, taxRateBps: 0, payments: [{ method: "CARD", amountCents: 10000, reference: null }], refunds: [{ amountCents: 2000, status }] });
    expect(summary.balanceCents).toBe(expected);
    expect(summary.refundedCents).toBe(expected);
  });

  it("reprinted cash receipt reads stored tender and change", () => {
    const summary = receiptSummary({ lines, taxRateBps: 0, payments: [{ method: "CASH", amountCents: 10000, reference: "Tendered $120.00" }], refunds: [] });
    expect(summary.tenderedCents).toBe(12000);
    expect(summary.changeCents).toBe(2000);
  });

  it("this month still means September on Edmonton's evening of September 30", () => {
    const period = resolveReportPeriod("this-month", new Date("2026-10-01T03:00:00Z"), zone);
    expect(period.fromValue).toBe("2026-09-01");
    expect(period.toValue).toBe("2026-09-30");
    expect(period.toExclusive.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });

  it.each([
    ["2026-03-08", 23], ["2026-11-01", 25],
  ])("report day %s follows the shop's clock change", (key, hours) => {
    const period = resolveReportPeriod({ period: "custom", from: key, to: key }, at, zone);
    expect((period.toExclusive.getTime() - period.from.getTime()) / 3600000).toBe(hours);
    expect(bucketIndex(period.buckets, period.from)).toBe(0);
    expect(bucketIndex(period.buckets, new Date(period.toExclusive.getTime() - 1))).toBe(0);
    expect(bucketIndex(period.buckets, period.toExclusive)).toBe(-1);
  });

  it("due-today ends at the next shop midnight even when the server is in tomorrow", () => {
    const range = dueTodayRange(at.getTime(), zone);
    expect(range.gte).toEqual(at);
    expect(range.lt.toISOString()).toBe("2026-10-04T06:00:00.000Z");
  });

  it("CSV export and report screen use the same shop-day boundaries", async () => {
    const scope = await reportScope(new Request("https://example.test/api/exports/reports-revenue.csv?period=custom&from=2026-10-03&to=2026-10-03"), "shop_1");
    const expected = shopDayRange("2026-10-03", "2026-10-03", zone);
    expect(scope.period.from).toEqual(expected.from);
    expect(scope.period.toExclusive).toEqual(expected.toExclusive);
  });

  it("invalid custom dates are refused rather than silently moved into March", () => {
    const period = resolveReportPeriod({ period: "custom", from: "2026-02-31", to: "2026-03-05" }, at, zone);
    expect(period.key).toBe("this-month");
  });

  it("failed card refunds do not lower Reports revenue", async () => {
    handlers["payment.findMany"] = () => [{ amountCents: 10000, createdAt: at }];
    handlers["refund.findMany"] = ({ where }) => (where as { status?: { not?: string } }).status?.not === "failed" ? [] : [{ id: "r_failed", amountCents: 2000, method: "CARD", reason: null, createdAt: at, status: "failed", invoice: { id: "i_1", number: 1001, customer: { firstName: "Test", lastName: "Customer", businessName: null } } }];
    const result = await loadReport("shop_1", resolveReportPeriod("this-month", at, zone), { includeMoney: true });
    expect(result.money?.netRevenueCents).toBe(10000);
    expect(result.money?.refundCount).toBe(0);
  });

  it("failed card refunds do not lower Home or Overview takings", async () => {
    handlers["refund.findMany"] = ({ where }) => (where as { status?: { not?: string } }).status?.not === "failed" ? [] : [{ amountCents: 2000, createdAt: at, status: "failed" }];
    const result = await loadTakingsRows("shop_1", "branch_1", at.getTime() - 3600000, at.getTime() + 3600000);
    expect(result.refunds).toEqual([]);
    const query = callsTo("refund.findMany")[0].args.where as Record<string, unknown>;
    expect(query.shopId).toBe("shop_1");
    expect(query.invoice).toEqual({ locationId: "branch_1" });
  });

  it("technician Reports never issue money queries", async () => {
    const result = await loadReport("shop_1", resolveReportPeriod("this-month", at, zone), { includeMoney: false });
    expect(result.money).toBeNull();
    for (const path of ["payment.findMany", "refund.findMany", "invoice.findMany", "deposit.findMany"]) expect(callsTo(path)).toEqual([]);
  });

  it.each([[zone, 1], ["UTC", 2]])("Reports debt and late count follow the %s shop calendar", async (timeZone, overdueCount) => {
    const customer = { id: "customer_1", firstName: "Test", lastName: "Customer", businessName: null, phone: null, mobile: null };
    const row = { taxRateBps: 0, customer, lines, payments: [], refunds: [] };
    handlers["invoice.findMany"] = ({ where }) => (where as { status?: { in?: string[] } }).status?.in ? [
      { ...row, id: "today", number: 1, dueDate: new Date("2026-10-03T00:00:00Z") },
      { ...row, id: "refunded", number: 2, dueDate: new Date("2026-10-02T00:00:00Z"), payments: [{ amountCents: 10000 }], refunds: [{ amountCents: 2000, status: "completed" }] },
      { ...row, id: "overpaid", number: 3, dueDate: null, payments: [{ amountCents: 15000 }] },
    ] : [];
    const clock = vi.spyOn(Date, "now").mockReturnValue(at.getTime());
    try {
      const result = await loadReport("shop_1", resolveReportPeriod("this-month", at, String(timeZone)), { includeMoney: true });
      expect(result.money?.ar).toMatchObject({ totalCents: 12000, count: 2, overdueCount });
    } finally {
      clock.mockRestore();
    }
  });
});
