import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { settleGatewayPayment } from "@/lib/payments/settle-gateway";
import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("@/lib/events", () => ({
  emitPaymentEvent: vi.fn(async () => {}),
  emitInvoiceEvent: vi.fn(async () => {}),
}));

beforeEach(() => {
  resetDb();
  vi.mocked(emitPaymentEvent).mockClear();
  vi.mocked(emitInvoiceEvent).mockClear();
});

function invoice() {
  return {
    id: "inv_1",
    status: "SENT",
    taxRateBps: 0,
    lines: [{ quantity: 1, unitPriceCents: 2500, taxable: true }],
    payments: [],
  };
}

describe("provider-neutral payment settlement", () => {
  it("records a completed Square payment and marks the invoice paid", async () => {
    handlers["invoice.findFirst"] = invoice;
    handlers["payment.findFirst"] = () => null;
    handlers["payment.create"] = () => ({ id: "pay_1" });
    handlers["invoice.update"] = () => ({ id: "inv_1" });

    const result = await settleGatewayPayment({
      provider: "square",
      shopId: "shop_1",
      invoiceId: "inv_1",
      amountCents: 2500,
      paymentId: "sqp_1",
      chargeId: "sqc_1",
      source: "terminal",
    });

    expect(result).toEqual({ status: "recorded", paymentId: "pay_1", invoiceStatus: "PAID" });
    expect(whereOf("invoice.findFirst")).toMatchObject({ id: "inv_1", shopId: "shop_1" });
    expect(dataOf("payment.create")).toMatchObject({
      gateway: "square",
      gatewayPaymentId: "sqp_1",
      gatewayChargeId: "sqc_1",
      gatewaySource: "terminal",
      method: "CARD",
    });
    expect(emitPaymentEvent).toHaveBeenCalledWith("shop_1", "pay_1");
    expect(emitInvoiceEvent).toHaveBeenCalledWith("shop_1", "invoice.paid", "inv_1");
  });

  it("deduplicates the same gateway payment inside the transaction", async () => {
    handlers["invoice.findFirst"] = invoice;
    handlers["payment.findFirst"] = () => ({ id: "pay_existing" });
    const result = await settleGatewayPayment({
      provider: "square",
      shopId: "shop_1",
      invoiceId: "inv_1",
      amountCents: 2500,
      paymentId: "sqp_1",
      source: "online",
    });
    expect(result).toEqual({ status: "ignored", reason: "already recorded" });
    expect(callsTo("payment.create")).toHaveLength(0);
    expect(callsTo("$transaction")[0]?.args.options).toEqual({ isolationLevel: "Serializable" });
  });
});
