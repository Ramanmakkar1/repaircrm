import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { settleStripePayment, type SettleInput } from "@/lib/payments/settle";

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
 * lib/payments/settle.ts — money Stripe has ALREADY taken.
 *
 * Four callers land here (checkout webhook, payment_intent webhook, card on
 * file, Terminal) and two of those pairs race each other by design. What makes
 * that safe:
 *
 *   · DEDUPE ON EITHER STRIPE ID. A Checkout payment is identifiable by its
 *     session id AND by its PaymentIntent id, and the two events carry
 *     different ones.
 *   · THE CHECK IS INSIDE THE TRANSACTION, at Serializable, so two simultaneous
 *     deliveries cannot both pass it.
 *   · OVERPAYMENT IS RECORDED, NOT REFUSED. The card is already debited; money
 *     that arrived and was not written down is the one outcome with no recovery.
 */

const SHOP = "shop_1";
const INVOICE = "inv_1";
const LINES = [{ quantity: 1, unitPriceCents: 10_000, taxable: true }];
const TOTAL = 11_000;

const input = (over: Partial<SettleInput> = {}): SettleInput => ({
  shopId: SHOP,
  invoiceId: INVOICE,
  amountCents: TOTAL,
  reference: "cs_test_123",
  paymentIntentId: "pi_test_123",
  chargeId: "ch_test_123",
  source: "checkout",
  ...over,
});

function stubInvoice(
  over: Partial<{
    status: string;
    taxRateBps: number;
    payments: { amountCents: number }[];
  }> = {},
): void {
  handlers["invoice.findFirst"] = () => ({
    id: INVOICE,
    status: "SENT",
    taxRateBps: 1000,
    lines: LINES,
    payments: [],
    ...over,
  });
}

function stubNoDuplicate(): void {
  handlers["payment.findFirst"] = () => null;
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

describe("input the webhook should not act on", () => {
  it("ignores a zero or negative amount without opening a transaction", async () => {
    for (const amountCents of [0, -1]) {
      resetDb();
      const outcome = await settleStripePayment(input({ amountCents }));
      expect(outcome).toEqual({
        status: "ignored",
        reason: "no amount to record",
      });
      expect(calls).toHaveLength(0);
    }
  });

  it("ignores a non-finite amount", async () => {
    const outcome = await settleStripePayment(input({ amountCents: Number.NaN }));
    expect(outcome.status).toBe("ignored");
    expect(calls).toHaveLength(0);
  });

  it("ignores a settlement missing any of shop, invoice or reference", async () => {
    for (const over of [{ shopId: "" }, { invoiceId: "" }, { reference: "" }]) {
      resetDb();
      const outcome = await settleStripePayment(input(over));
      expect(outcome).toEqual({
        status: "ignored",
        reason: "incomplete settlement",
      });
      expect(calls).toHaveLength(0);
    }
  });

  it("ignores an invoice that does not belong to that shop", async () => {
    handlers["invoice.findFirst"] = () => null;

    const outcome = await settleStripePayment(input());

    expect(outcome).toEqual({
      status: "ignored",
      reason: "invoice not found for that shop",
    });
    expect(callsTo("payment.create")).toHaveLength(0);
  });

  it("refuses to settle a VOID invoice, and says so loudly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubInvoice({ status: "VOID" });
    stubNoDuplicate();

    const outcome = await settleStripePayment(input());

    expect(outcome).toEqual({ status: "ignored", reason: "invoice is void" });
    expect(callsTo("payment.create")).toHaveLength(0);
    // A human has to refund this by hand; silence would hide that.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("refund required"),
    );
    error.mockRestore();
  });
});

describe("dedupe", () => {
  it("does nothing when a payment with the same REFERENCE already exists", async () => {
    stubInvoice();
    handlers["payment.findFirst"] = () => ({ id: "pay_existing" });

    const outcome = await settleStripePayment(input());

    expect(outcome).toEqual({ status: "ignored", reason: "already recorded" });
    expect(callsTo("payment.create")).toHaveLength(0);
    expect(callsTo("invoice.update")).toHaveLength(0);
    expect(emitPaymentEvent).not.toHaveBeenCalled();
  });

  it("matches on EITHER the reference or the PaymentIntent id", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    // This OR is what lets checkout.session.completed and
    // payment_intent.succeeded describe the same money without paying twice.
    expect(whereOf("payment.findFirst")).toEqual({
      invoiceId: INVOICE,
      OR: [
        { reference: "cs_test_123" },
        { stripePaymentIntentId: "pi_test_123" },
      ],
    });
  });

  it("drops the PaymentIntent clause when there is no intent id", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input({ paymentIntentId: null }));

    expect(whereOf("payment.findFirst")).toEqual({
      invoiceId: INVOICE,
      OR: [{ reference: "cs_test_123" }],
    });
  });

  it("re-checks INSIDE the transaction, not before it", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    const order = calls.map((call) => call.path);
    expect(order.indexOf("$transaction")).toBeLessThan(
      order.indexOf("payment.findFirst"),
    );
  });

  it("asks for a SERIALIZABLE transaction, which is what makes the re-check hold", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    expect(callsTo("$transaction")[0].args.options).toEqual({
      isolationLevel: "Serializable",
    });
  });
});

describe("recording", () => {
  it("writes the payment with every Stripe handle the till will need later", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    const outcome = await settleStripePayment(
      input({ source: "terminal", takenById: "user_1" }),
    );

    expect(outcome).toEqual({
      status: "recorded",
      paymentId: "pay_new",
      invoiceStatus: "PAID",
    });

    expect(dataOf("payment.create")).toEqual({
      shopId: SHOP,
      invoiceId: INVOICE,
      amountCents: TOTAL,
      method: "CARD",
      reference: "cs_test_123",
      stripePaymentIntentId: "pi_test_123",
      stripeChargeId: "ch_test_123",
      stripeSource: "terminal",
      takenById: "user_1",
    });
  });

  it("always books Stripe money as a CARD payment", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input({ source: "card_on_file" }));

    expect(dataOf("payment.create").method).toBe("CARD");
  });

  it("defaults the cashier to null, because a webhook has no human", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    expect(dataOf("payment.create").takenById).toBeNull();
  });

  it("rounds a fractional amount to whole cents", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input({ amountCents: 10_000.6 }));

    expect(dataOf("payment.create").amountCents).toBe(10_001);
  });

  it("settles the invoice to PAID with a paidAt stamp", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    const update = dataOf("invoice.update");
    expect(update.status).toBe("PAID");
    expect(update.paidAt).toBeInstanceOf(Date);
  });

  it("leaves a short payment PARTIAL with paidAt cleared", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    const outcome = await settleStripePayment(input({ amountCents: 1_000 }));

    expect(outcome.status === "recorded" && outcome.invoiceStatus).toBe("PARTIAL");
    expect(dataOf("invoice.update")).toEqual({ status: "PARTIAL", paidAt: null });
  });

  it("recomputes the status from the invoice's own rows, never from a delta", async () => {
    // An out-of-order redelivery where an earlier payment already landed.
    stubInvoice({ payments: [{ amountCents: 10_000 }] });
    stubNoDuplicate();
    stubWrites();

    const outcome = await settleStripePayment(input({ amountCents: 1_000 }));

    expect(outcome.status === "recorded" && outcome.invoiceStatus).toBe("PAID");
  });

  it("RECORDS AN OVERPAYMENT rather than refusing it", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    const outcome = await settleStripePayment(input({ amountCents: TOTAL + 5_000 }));

    expect(outcome.status).toBe("recorded");
    expect(dataOf("payment.create").amountCents).toBe(TOTAL + 5_000);
    expect(dataOf("invoice.update").status).toBe("PAID");
  });

  it("reports an error so Stripe redelivers when the write blows up", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubInvoice();
    stubNoDuplicate();
    handlers["payment.create"] = () => {
      throw new Error("connection reset");
    };

    const outcome = await settleStripePayment(input());

    expect(outcome).toEqual({ status: "error", reason: "connection reset" });
    expect(emitPaymentEvent).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("events", () => {
  it("announces the payment after the commit", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    expect(emitPaymentEvent).toHaveBeenCalledWith(SHOP, "pay_new");
    expect(emitInvoiceEvent).toHaveBeenCalledWith(SHOP, "invoice.paid", INVOICE);
  });

  it("announces nothing for a duplicate delivery", async () => {
    stubInvoice();
    handlers["payment.findFirst"] = () => ({ id: "pay_existing" });

    await settleStripePayment(input());

    expect(emitPaymentEvent).not.toHaveBeenCalled();
    expect(emitInvoiceEvent).not.toHaveBeenCalled();
  });

  it("does not announce invoice.paid on a partial settlement", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input({ amountCents: 1 }));

    expect(emitPaymentEvent).toHaveBeenCalled();
    expect(emitInvoiceEvent).not.toHaveBeenCalled();
  });
});

describe("multi-tenancy", () => {
  it("scopes the invoice by BOTH ids, because both arrived over the wire", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    expect(whereOf("invoice.findFirst")).toEqual({ id: INVOICE, shopId: SHOP });
  });

  it("stamps the resolved shopId onto the Payment row", async () => {
    stubInvoice();
    stubNoDuplicate();
    stubWrites();

    await settleStripePayment(input());

    expect(dataOf("payment.create").shopId).toBe(SHOP);
  });

  it("a mismatched shop/invoice pair writes nothing at all", async () => {
    handlers["invoice.findFirst"] = () => null;

    await settleStripePayment(input({ shopId: "shop_other" }));

    expect(callsTo("payment.create")).toHaveLength(0);
    expect(callsTo("invoice.update")).toHaveLength(0);
  });
});
