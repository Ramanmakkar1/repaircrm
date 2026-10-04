import { describe, expect, it, vi } from "vitest";

import { handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const { refundAwareTotals } = await import("@/components/billing/refund-math");
const { balanceBlock } = await import("@/components/billing/bill-display");
const { invoiceIsPayable, invoiceSheetProps } = await import("@/components/billing/print-mappers");
const { receiptSummary, tenderedFromReference, tenderedReference } = await import("@/components/billing/receipt-math");
const { loadStatement } = await import("@/components/statements/query");
const { refundedStatusLabel } = await import("@/components/billing/status-badge");
const { resolvePeriod } = await import("@/components/statements/period");

import type { PrintableInvoice, PrintShop } from "@/components/billing/print-mappers";

/**
 * Refunds read the same everywhere.
 *
 * Invoice #1011: one $50.00 taxable line at 8.20% ($54.10), paid $54.10 by
 * card, then $27.05 refunded. The app has always said $27.05 is owing again;
 * the printed invoice, the 80mm receipt and the customer statement ignored the
 * refund and printed $0.00. They now all read the one refund-aware helper
 * (components/billing/refund-math.ts) and agree to the cent.
 */

const SHOP = "shop_1";
const LINES = [{ id: "l1", quantity: 1, unitPriceCents: 5_000, taxable: true, description: "Screen protector", serial: null, warrantyDays: null }];
const TAX_BPS = 820;
const PAID = 5_410;
const REFUNDED = 2_705;
const OWING = 2_705;
const AT = new Date("2026-09-20T15:00:00.000Z");

const payments = [{ id: "p1", amountCents: PAID, method: "CARD", reference: "VISA ··4412", createdAt: AT }];
const refunds = [
  { id: "r1", amountCents: REFUNDED, method: "CARD", reason: "Returned unopened", status: "completed", createdAt: new Date("2026-09-21T16:00:00.000Z") },
  // A card refund Stripe refused never left the shop: it counts nowhere.
  { id: "r2", amountCents: 1_000, method: "CARD", reason: null, status: "failed", createdAt: new Date("2026-09-21T16:05:00.000Z") },
];

const shop: PrintShop = {
  name: "Demo Repair Shop",
  address1: null,
  address2: null,
  city: null,
  state: null,
  postalCode: null,
  phone: null,
  email: null,
  logoUrl: null,
  timezone: "America/Edmonton",
  taxRateBps: TAX_BPS,
};

function printable(): PrintableInvoice {
  return {
    id: "inv_1011",
    number: 1011,
    status: "PARTIAL",
    taxRateBps: TAX_BPS,
    createdAt: AT,
    dueDate: null,
    paidAt: null,
    notes: null,
    signatureDataUrl: null,
    customer: { firstName: "Owen", lastName: "Fitzgerald", businessName: null },
    taxRate: null,
    lines: LINES,
    payments,
    refunds,
  } as unknown as PrintableInvoice;
}

describe("one refunded invoice, four places", () => {
  const app = refundAwareTotals(LINES, TAX_BPS, payments, refunds);

  it("the app: $27.05 owing again, in words", () => {
    expect(app.totalCents).toBe(PAID);
    expect(app.refundedCents).toBe(REFUNDED);
    expect(app.balanceCents).toBe(OWING);
    const block = balanceBlock(
      { status: "PARTIAL", totalCents: app.totalCents, paidCents: app.paidCents, refundedCents: app.refundedCents, balanceCents: app.balanceCents, dueDate: null, paidAt: null },
      Date.UTC(2026, 9, 3),
    );
    expect(block.headline).toBe("$27.05 owing again");
  });

  it("the printed invoice (single and batch share the mapper): the same balance, with the refund on the paper", () => {
    const sheet = invoiceSheetProps(printable(), shop);
    const balance = sheet.totals.find((row) => row.emphasis);
    expect(balance?.value).toBe("$27.05");
    expect(sheet.totals.map((row) => row.label)).toContain("Refunded to you");
    // The refund is listed with the payments; the failed one is not.
    expect(sheet.payments?.map((row) => row.amountCents)).toEqual([PAID, -REFUNDED]);
    expect(sheet.paymentsLabel).toBe("Payments and refunds");
  });

  it("the printed invoice hides a zero payments line on an unpaid bill", () => {
    const unpaid = { ...printable(), status: "SENT", payments: [], refunds: [] } as unknown as PrintableInvoice;
    const labels = invoiceSheetProps(unpaid, shop).totals.map((row) => row.label);
    expect(labels).not.toContain("Payments received");
    expect(labels).not.toContain("Refunded to you");
  });

  it("the 80mm receipt: the same balance due", () => {
    const slip = receiptSummary({ lines: LINES, taxRateBps: TAX_BPS, payments, refunds });
    expect(slip.balanceCents).toBe(OWING);
    expect(slip.refundedCents).toBe(REFUNDED);
  });

  it("the customer statement: the same balance, and the refund in its money list", async () => {
    resetDb();
    handlers["shop.findUnique"] = () => ({ name: "Demo Repair Shop", address1: null, address2: null, city: null, state: null, postalCode: null, phone: null, email: null });
    handlers["customer.findFirst"] = () => ({ id: "c1", firstName: "Owen", lastName: "Fitzgerald", businessName: null, email: null, phone: null, address1: null, address2: null, city: null, state: null, postalCode: null, creditBalanceCents: 0 });
    const invoiceRow = { id: "inv_1011", number: 1011, status: "PARTIAL", createdAt: AT, dueDate: null, taxRateBps: TAX_BPS, lines: LINES, payments, refunds };
    handlers["invoice.findMany"] = (args) => [invoiceRow].filter(() => Boolean(args.where));
    handlers["payment.findMany"] = () => payments.map((payment) => ({ ...payment, invoice: { id: "inv_1011", number: 1011 } }));
    handlers["refund.findMany"] = () => [refunds[0]].map((refund) => ({ ...refund, invoice: { id: "inv_1011", number: 1011 } }));

    const period = resolvePeriod("2026-09-01", "2026-09-30", new Date("2026-10-03T15:00:00Z"), "America/Edmonton");
    const statement = await loadStatement(SHOP, "c1", period);
    expect(statement?.invoices[0].balanceCents).toBe(OWING);
    expect(statement?.totals.outstandingCents).toBe(OWING);
    expect(statement?.totals.refundedCents).toBe(REFUNDED);
    expect(statement?.owing.map((row) => row.balanceCents)).toEqual([OWING]);
    // Tenant-scoped, and a failed refund is never listed.
    expect(whereOf("refund.findMany")).toMatchObject({ shopId: SHOP, invoice: { customerId: "c1" }, status: { not: "failed" } });
  });
});

describe("the receipt's change, from what was stored", () => {
  it("reads the register's 'Tendered $X' back, so a reprint still shows the change", () => {
    expect(tenderedFromReference("Tendered $50.00")).toBe(5_000);
    expect(tenderedFromReference("Tendered $1,234.50")).toBe(123_450);
    expect(tenderedFromReference("VISA ··4412")).toBeNull();
    const slip = receiptSummary({
      lines: [{ quantity: 1, unitPriceCents: 4_067, taxable: false }],
      taxRateBps: 0,
      payments: [{ amountCents: 4_067, method: "CASH", reference: "Tendered $50.00" }],
      refunds: [],
    });
    expect(slip.tenderedCents).toBe(5_000);
    expect(slip.changeCents).toBe(933);
  });

  it("prefers the change the register passed on the first print", () => {
    const slip = receiptSummary({
      lines: [{ quantity: 1, unitPriceCents: 4_067, taxable: false }],
      taxRateBps: 0,
      payments: [{ amountCents: 4_067, method: "CASH", reference: null }],
      refunds: [],
      changeFromQuery: 933,
    });
    expect(slip.changeCents).toBe(933);
  });

  it("Take payment writes the register's own words, and only when there is change", () => {
    expect(tenderedReference(5_000, 2_705)).toBe("Tendered $50.00");
    expect(tenderedReference(2_705, 2_705)).toBeNull();
    expect(tenderedFromReference(tenderedReference(123_450, 100) ?? "")).toBe(123_450);
  });
});

describe("the badge on a refunded invoice says so", () => {
  it("reads Refunded / Part refunded instead of Sent / Partial, and leaves Paid and Void alone", () => {
    expect(refundedStatusLabel("SENT")).toBe("Refunded");
    expect(refundedStatusLabel("PARTIAL")).toBe("Part refunded");
    expect(refundedStatusLabel("PAID")).toBeNull();
    expect(refundedStatusLabel("VOID")).toBeNull();
  });
});

describe("the printed invoice's pay-online QR", () => {
  it("is offered only while something is owed, refund-aware", () => {
    expect(invoiceIsPayable(printable())).toBe(true);
    const settled = { ...printable(), refunds: [] } as unknown as PrintableInvoice;
    expect(invoiceIsPayable(settled)).toBe(false);
    const voided = { ...printable(), status: "VOID" } as unknown as PrintableInvoice;
    expect(invoiceIsPayable(voided)).toBe(false);
  });
});
