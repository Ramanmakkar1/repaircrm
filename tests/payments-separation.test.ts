import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { recordPayment } from "@/lib/payments/record";
import { settleStripePayment } from "@/lib/payments/settle";

import { callsTo, dataOf, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("@/lib/events", () => ({
  emitPaymentEvent: vi.fn(async () => {}),
  emitInvoiceEvent: vi.fn(async () => {}),
}));

/**
 * THE SEPARATION BETWEEN record.ts AND settle.ts.
 *
 * These are two deliberately different implementations of "write down some
 * money", and the difference is not an accident of history:
 *
 *   record.ts   KEYED IN. Nobody has been charged yet, so an amount larger than
 *               the balance is a typo and the right answer is to refuse it. It
 *               can also draw down store credit, which is a real balance that
 *               has to move in the same transaction.
 *   settle.ts   ALREADY CHARGED. The card is debited whatever we decide, so an
 *               overpayment is recorded in full, and the two Stripe ids are the
 *               dedupe keys that let a webhook and a synchronous write race.
 *
 * Where they must NOT differ: the invoice status they leave behind, and the
 * events they emit. This file pins both halves of that at once, so a change to
 * either file that quietly converges or diverges them fails here.
 */

const SHOP = "shop_1";
const INVOICE = "inv_1";
const LINES = [{ quantity: 1, unitPriceCents: 10_000, taxable: true }];
const TOTAL = 11_000;

function stubBoth(payments: { amountCents: number }[] = []): void {
  handlers["invoice.findFirst"] = () => ({
    id: INVOICE,
    status: "SENT",
    customerId: "cus_1",
    taxRateBps: 1000,
    number: 1042,
    lines: LINES,
    payments,
  });
  handlers["payment.findFirst"] = () => null;
  handlers["payment.create"] = () => ({ id: "pay_new" });
  handlers["invoice.update"] = () => ({ id: INVOICE });
}

beforeEach(() => {
  resetDb();
  vi.mocked(emitPaymentEvent).mockClear();
  vi.mocked(emitInvoiceEvent).mockClear();
});

describe("overpayment — the question that only makes sense before the money moves", () => {
  const OVER = TOTAL + 5_000;

  it("record REFUSES it and writes nothing", async () => {
    stubBoth();

    const result = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: OVER,
      method: "CASH",
    });

    expect(result.ok).toBe(false);
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("settle RECORDS it in full, because the card is already debited", async () => {
    stubBoth();

    const outcome = await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: OVER,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: "ch_1",
      source: "checkout",
    });

    expect(outcome.status).toBe("recorded");
    expect(dataOf("payment.create").amountCents).toBe(OVER);
  });
});

describe("dedupe — the question that only makes sense after it", () => {
  it("settle looks for an existing Stripe payment before writing", async () => {
    stubBoth();

    await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });

    expect(callsTo("payment.findFirst")).toHaveLength(1);
  });

  it("record does not, because a keyed-in payment has no Stripe id to dedupe on", async () => {
    stubBoth();

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });

    expect(callsTo("payment.findFirst")).toHaveLength(0);
    // And it never claims a Stripe handle it does not have.
    expect(dataOf("payment.create").stripePaymentIntentId).toBeUndefined();
  });
});

describe("store credit — only the keyed-in path can spend it", () => {
  it("record draws the balance down", async () => {
    stubBoth();
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      creditBalanceCents: 50_000,
    });
    handlers["customer.update"] = () => ({ id: "cus_1" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });

    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CREDIT",
    });

    expect(callsTo("customer.update")).toHaveLength(1);
  });

  it("settle has no notion of it — every Stripe payment is a CARD", async () => {
    stubBoth();

    await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });

    expect(callsTo("customer.update")).toHaveLength(0);
    expect(dataOf("payment.create").method).toBe("CARD");
  });
});

describe("what the two must agree on", () => {
  it("leave the identical invoice status and paidAt for the same money", async () => {
    stubBoth();
    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CARD",
    });
    const keyed = dataOf("invoice.update");

    resetDb();
    stubBoth();
    await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });
    const stripe = dataOf("invoice.update");

    expect(keyed.status).toBe("PAID");
    expect(stripe.status).toBe("PAID");
    expect(keyed.paidAt).toBeInstanceOf(Date);
    expect(stripe.paidAt).toBeInstanceOf(Date);
  });

  it("leave the identical PARTIAL state for the same short payment", async () => {
    stubBoth();
    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      method: "CASH",
    });
    const keyed = dataOf("invoice.update");

    resetDb();
    stubBoth();
    await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: 1_000,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });

    expect(keyed).toEqual({ status: "PARTIAL", paidAt: null });
    expect(dataOf("invoice.update")).toEqual({ status: "PARTIAL", paidAt: null });
  });

  it("emit the same events, so a card payment announces itself like a keyed-in one", async () => {
    stubBoth();
    await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });

    expect(emitPaymentEvent).toHaveBeenCalledWith(SHOP, "pay_new");
    expect(emitInvoiceEvent).toHaveBeenCalledWith(SHOP, "invoice.paid", INVOICE);

    vi.mocked(emitPaymentEvent).mockClear();
    vi.mocked(emitInvoiceEvent).mockClear();
    resetDb();
    stubBoth();

    await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });

    expect(emitPaymentEvent).toHaveBeenCalledWith(SHOP, "pay_new");
    expect(emitInvoiceEvent).toHaveBeenCalledWith(SHOP, "invoice.paid", INVOICE);
  });

  it("both refuse a VOID invoice, by different routes to the same answer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    handlers["invoice.findFirst"] = () => ({
      id: INVOICE,
      status: "VOID",
      customerId: "cus_1",
      taxRateBps: 1000,
      number: 1042,
      lines: LINES,
      payments: [],
    });
    handlers["payment.findFirst"] = () => null;

    const keyed = await recordPayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CASH",
    });
    const stripe = await settleStripePayment({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      reference: "cs_1",
      paymentIntentId: "pi_1",
      chargeId: null,
      source: "checkout",
    });

    expect(keyed.ok).toBe(false);
    expect(stripe.status).toBe("ignored");
    expect(callsTo("payment.create")).toHaveLength(0);
    error.mockRestore();
  });
});
