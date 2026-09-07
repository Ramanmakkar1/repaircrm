import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { PAYMENT_METHODS, recordPayment } from "@/lib/payments/record";

import { calls, callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("@/lib/events", () => ({
  emitPaymentEvent: vi.fn(async () => {}),
  emitInvoiceEvent: vi.fn(async () => {}),
}));

/**
 * lib/payments/record.ts — KEYED-IN money.
 *
 * This is the path where nobody has been charged yet: the counter form and
 * POST /api/v1/payments. Its defining behaviours, all of which are the OPPOSITE
 * of the Stripe path in ./settle.ts:
 *
 *   · an amount larger than the balance is REFUSED, because the operator can
 *     simply retype it (settle records the overpayment — the card is debited);
 *   · CREDIT draws the customer's stored balance down in the same transaction;
 *   · there are no Stripe ids, so there is no dedupe.
 *
 * The separation between the two is asserted directly in
 * tests/payments-separation.test.ts.
 */

const SHOP = "shop_1";
const INVOICE = "inv_1";

/** A $110.00 invoice: one $100.00 taxable line at 10%. */
const LINES = [{ quantity: 1, unitPriceCents: 10_000, taxable: true }];
const TOTAL = 11_000;

type InvoiceRow = {
  id: string;
  status: string;
  customerId: string;
  taxRateBps: number;
  number: number;
  lines: { quantity: number; unitPriceCents: number; taxable: boolean }[];
  payments: { amountCents: number }[];
  refunds: { amountCents: number; status: string | null }[];
};

function stubInvoice(over: Partial<InvoiceRow> = {}): void {
  const row: InvoiceRow = {
    id: INVOICE,
    status: "SENT",
    customerId: "cus_1",
    taxRateBps: 1000,
    number: 1042,
    lines: LINES,
    payments: [],
    refunds: [],
    ...over,
  };
  handlers["invoice.findFirst"] = () => row;
}

function stubWrites(): void {
  handlers["payment.create"] = () => ({ id: "pay_new" });
  handlers["invoice.update"] = () => ({ id: INVOICE });
}

beforeEach(() => {
  resetDb();
  vi.mocked(emitPaymentEvent).mockClear();
  vi.mocked(emitInvoiceEvent).mockClear();
});

describe("the method list", () => {
  it("matches the tender types the schema allows", () => {
    expect([...PAYMENT_METHODS]).toEqual([
      "CASH",
      "CARD",
      "CHECK",
      "OTHER",
      "CREDIT",
    ]);
  });
});

describe("refusals — before any money moves", () => {
  it("refuses an invoice that is not in this shop", async () => {
    handlers["invoice.findFirst"] = () => null;

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(result).toEqual({ ok: false, error: "That invoice no longer exists." });
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("refuses a VOID invoice — the receivable is gone", async () => {
    stubInvoice({ status: "VOID" });

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/void/i);
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("refuses a zero or negative amount", async () => {
    stubInvoice();

    for (const amountCents of [0, -1, -10_000]) {
      const result = await recordPayment({
        shopId: SHOP,
        invoiceId: INVOICE,
        amountCents,
        method: "CASH",
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/greater than zero/i);
    }
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("refuses an invoice with no lines", async () => {
    stubInvoice({ lines: [] });

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/line items/i);
  });

  it("REFUSES AN OVERPAYMENT and names the outstanding figure", async () => {
    stubInvoice();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL + 1,
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      "That is more than the $110.00 still outstanding.",
    );
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("prices the ceiling off the REMAINING balance, not the total", async () => {
    stubInvoice({ payments: [{ amountCents: 6_000 }] });

    const tooMuch = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 5_001,
      method: "CASH",
    });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.ok === false && tooMuch.error).toContain("$50.00");

    stubWrites();
    const exact = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 5_000,
      method: "CASH",
    });
    expect(exact.ok).toBe(true);
  });

  it("emits nothing when it refuses", async () => {
    stubInvoice({ status: "VOID" });
    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(emitPaymentEvent).not.toHaveBeenCalled();
    expect(emitInvoiceEvent).not.toHaveBeenCalled();
  });
});

describe("recording a payment", () => {
  it("settles the invoice when the balance is cleared exactly", async () => {
    stubInvoice();
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CARD",
      reference: "auth 4242",
      takenById: "user_1",
    });

    expect(result).toEqual({
      ok: true,
      paymentId: "pay_new",
      invoiceStatus: "PAID",
      settled: true,
    });

    expect(dataOf("payment.create")).toMatchObject({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CARD",
      reference: "auth 4242",
      takenById: "user_1",
    });

    const update = dataOf("invoice.update");
    expect(update.status).toBe("PAID");
    expect(update.paidAt).toBeInstanceOf(Date);
  });

  it("leaves a short payment PARTIAL and clears paidAt", async () => {
    stubInvoice();
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1,
      method: "CASH",
    });

    expect(result).toEqual({
      ok: true,
      paymentId: "pay_new",
      invoiceStatus: "PARTIAL",
      settled: false,
    });
    expect(dataOf("invoice.update")).toEqual({ status: "PARTIAL", paidAt: null });
  });

  it("settles when an earlier partial payment plus this one clears the total", async () => {
    stubInvoice({ payments: [{ amountCents: 10_999 }] });
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1,
      method: "CASH",
    });

    expect(result.ok && result.invoiceStatus).toBe("PAID");
  });

  it("defaults reference and taker to null", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(dataOf("payment.create")).toMatchObject({
      reference: null,
      takenById: null,
    });
  });
});

describe("store credit", () => {
  function stubCustomer(creditBalanceCents: number): void {
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      creditBalanceCents,
    });
    handlers["customer.update"] = () => ({ id: "cus_1" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });
  }

  it("draws the balance down and writes the matching ledger row", async () => {
    stubInvoice();
    stubWrites();
    stubCustomer(20_000);

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CREDIT",
      takenById: "user_1",
    });

    expect(result.ok).toBe(true);
    expect(dataOf("customer.update")).toEqual({
      creditBalanceCents: { decrement: TOTAL },
    });

    // The ledger row is the whole point: a balance that moves with nothing
    // saying why is what CreditAdjustment exists to prevent.
    expect(dataOf("creditAdjustment.create")).toMatchObject({
      shopId: SHOP,
      customerId: "cus_1",
      deltaCents: -TOTAL,
      reason: "Applied to invoice #1042",
      userId: "user_1",
    });
  });

  it("refuses when the customer does not have enough credit", async () => {
    stubInvoice();
    stubWrites();
    stubCustomer(500);

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CREDIT",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      "Only $5.00 of store credit is available.",
    );
    // Nothing was written and nothing was announced.
    expect(callsTo("customer.update")).toHaveLength(0);
    expect(callsTo("payment.create")).toHaveLength(0);
    expect(emitPaymentEvent).not.toHaveBeenCalled();
  });

  it("refuses when the customer has vanished", async () => {
    stubInvoice();
    stubWrites();
    handlers["customer.findFirst"] = () => null;

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CREDIT",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Customer not found.");
  });

  it("draws credit BEFORE writing the payment, inside one transaction", async () => {
    stubInvoice();
    stubWrites();
    stubCustomer(20_000);

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CREDIT",
    });

    const order = calls.map((call) => call.path);
    expect(order.indexOf("$transaction")).toBeLessThan(
      order.indexOf("customer.update"),
    );
    expect(order.indexOf("customer.update")).toBeLessThan(
      order.indexOf("payment.create"),
    );
    expect(order.indexOf("creditAdjustment.create")).toBeLessThan(
      order.indexOf("payment.create"),
    );
  });

  it("does not touch store credit for any other tender", async () => {
    for (const method of ["CASH", "CARD", "CHECK", "OTHER"] as const) {
      resetDb();
      stubInvoice();
      stubWrites();

      await recordPayment({
        shopId: SHOP,
        invoiceId: INVOICE,
        amountCents: 1_000,
        method,
      });

      expect(callsTo("customer.update")).toHaveLength(0);
      expect(callsTo("creditAdjustment.create")).toHaveLength(0);
    }
  });
});

describe("events", () => {
  it("announces the payment AFTER the commit", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(emitPaymentEvent).toHaveBeenCalledWith(SHOP, "pay_new");
  });

  it("announces invoice.paid ONLY when the invoice actually settled", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });
    expect(emitInvoiceEvent).not.toHaveBeenCalled();

    vi.mocked(emitInvoiceEvent).mockClear();
    resetDb();
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });
    expect(emitInvoiceEvent).toHaveBeenCalledWith(SHOP, "invoice.paid", INVOICE);
  });
});

describe("multi-tenancy", () => {
  it("scopes the invoice lookup by BOTH id and shopId", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(whereOf("invoice.findFirst")).toEqual({ id: INVOICE, shopId: SHOP });
  });

  it("scopes the store-credit lookup by shopId too", async () => {
    stubInvoice();
    stubWrites();
    handlers["customer.findFirst"] = () => ({ id: "cus_1", creditBalanceCents: 0 });

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CREDIT",
    });

    expect(whereOf("customer.findFirst")).toEqual({ id: "cus_1", shopId: SHOP });
  });

  it("stamps the session's shopId onto the Payment row", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    expect(dataOf("payment.create").shopId).toBe(SHOP);
  });
});

/**
 * FIXED — the counter can take a payment on a REFUNDED invoice.
 *
 * `recordPayment` used to compute its ceiling with `invoiceTotals`, which
 * counts payments and knows nothing about refunds, while the invoice screen
 * computed the same figure with `refundAwareTotals`, which subtracts them.
 *
 * On an invoice paid in full and then refunded in full the two disagreed:
 *
 *   app/(app)/invoices/[id]/page.tsx  balance = total - (paid - refunded)
 *                                     -> $110.00 owed, status walked back to
 *                                        SENT by `statusForNetPaid`
 *   recordPayment                     balance = total - paid
 *                                     -> $0.00, so EVERY amount was refused
 *                                        with "That is more than the $0.00
 *                                        still outstanding."
 *
 * The customer stood at the counter looking at an invoice the app said they
 * owed, and the till would not take their money. Both paths now use the same
 * definition of "outstanding", and `recordPayment` selects `refunds` so it can.
 */
describe("refunded invoices", () => {
  it("takes a re-payment on an invoice whose money was refunded", async () => {
    // Paid in full, then refunded in full. The Payment rows stay — they are
    // append-only — so a refund-blind ceiling still reads this as settled.
    stubInvoice({
      status: "SENT",
      payments: [{ amountCents: TOTAL }],
      refunds: [{ amountCents: TOTAL, status: "completed" }],
    });
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });

    expect(result.ok).toBe(true);
    expect(dataOf("payment.create").amountCents).toBe(TOTAL);
    // and it settles the invoice again
    expect(dataOf("invoice.update").status).toBe("PAID");
  });

  it("still refuses more than the refund-aware balance", async () => {
    // Paid in full, HALF refunded: $55.00 is genuinely outstanding again.
    stubInvoice({
      status: "SENT",
      payments: [{ amountCents: TOTAL }],
      refunds: [{ amountCents: TOTAL / 2, status: "completed" }],
    });
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });

    expect(result).toEqual({
      ok: false,
      error: "That is more than the $55.00 still outstanding.",
    });
  });

  it("ignores a FAILED refund — that money never left", async () => {
    stubInvoice({
      status: "SENT",
      payments: [{ amountCents: TOTAL }],
      refunds: [{ amountCents: TOTAL, status: "failed" }],
    });
    stubWrites();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 100,
      method: "CASH",
    });

    expect(result).toEqual({
      ok: false,
      error: "That is more than the $0.00 still outstanding.",
    });
  });
});

/**
 * FIXED — the overpayment ceiling is now computed INSIDE the transaction.
 *
 * It used to be read with a plain `findFirst` before a separate `$transaction`
 * opened to write, and the balance was never re-read. Two cashiers taking the
 * last $50 of a balance at the same moment both read $50 remaining, both passed
 * the check, and both wrote — leaving the invoice overpaid by exactly the
 * amount the module's own header says it refuses.
 *
 * lib/payments/settle.ts had always done its read AND its write inside one
 * Serializable transaction, for the same reason (asserted in
 * tests/payments-settle.test.ts). These two assert that `recordPayment` now
 * matches it, and they are what stops the split being reintroduced: the race
 * itself needs a real database, but the ordering is the whole cause.
 */
describe("the overpayment check and the transaction", () => {
  it("reads the balance INSIDE the transaction that writes", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    const order = calls.map((call) => call.path);
    // the transaction opens first, and the read happens within it
    expect(order.indexOf("$transaction")).toBeLessThan(
      order.indexOf("invoice.findFirst"),
    );
    // read exactly once, and inside — not once outside and never again
    expect(callsTo("invoice.findFirst")).toHaveLength(1);
  });

  it("asks for a Serializable transaction, so the check cannot be raced", async () => {
    stubInvoice();
    stubWrites();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });

    const transaction = callsTo("$transaction")[0];
    expect(transaction.args.options).toEqual({ isolationLevel: "Serializable" });
  });
});
