import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";
import { invoiceRowFigures } from "@/components/customers/customer-screen";
import { invoiceSelect, serialiseInvoice, serialiseInvoiceDetail } from "@/app/api/v1/_lib/shapes";
import { emitInvoiceEvent } from "@/lib/events";

vi.mock("@/lib/db", () => ({ db: fakeClient }));

const at = new Date("2026-10-04T12:00:00Z");
function invoice(status: string = "completed") {
  return {
    id: "invoice_1", number: 1001, status: "PARTIAL" as const,
    customerId: "customer_1", ticketId: null, estimateId: null,
    taxRateBps: 0, notes: null, dueDate: null, paidAt: null,
    createdAt: at, updatedAt: at,
    lines: [{ id: "line_1", productId: null, description: "Repair", quantity: 1, unitPriceCents: 10000, taxable: false, serial: null, sortOrder: 0 }],
    payments: [{ id: "payment_1", amountCents: 10000, method: "CARD" as const, reference: null, createdAt: at }],
    refunds: [{ amountCents: 2000, status }],
  };
}

describe("remaining refund-aware customer and integration balances", () => {
  beforeEach(resetDb);

  it.each(["completed", "pending"])("customer invoice row shows the debt from a %s refund", (status) => {
    expect(invoiceRowFigures(invoice(status), at.getTime())).toMatchObject({ balanceCents: 2000, money: { text: "$20.00 due" } });
  });

  it("customer invoice row ignores a failed refund", () => {
    expect(invoiceRowFigures(invoice("failed"), at.getTime())).toMatchObject({ balanceCents: 0, money: { text: "Paid" } });
  });

  it("invoice API list and detail reconcile gross payments, refunds, net paid and debt", () => {
    expect(invoiceSelect).toHaveProperty("refunds");
    for (const serialise of [serialiseInvoice, serialiseInvoiceDetail]) {
      expect(serialise(invoice()).totals).toMatchObject({ paidCents: 10000, refundedCents: 2000, netPaidCents: 8000, balanceCents: 2000 });
      expect(serialise(invoice("failed")).totals).toMatchObject({ refundedCents: 0, netPaidCents: 10000, balanceCents: 0 });
    }
  });

  it("invoice webhook queues the same balance as the API, scoped to its shop", async () => {
    handlers["webhook.findFirst"] = () => ({ id: "hook_1" });
    handlers["invoice.findFirst"] = () => invoice();
    handlers["webhook.findMany"] = () => [{ id: "hook_1" }];
    handlers["webhookDelivery.createMany"] = () => ({ count: 1 });
    await emitInvoiceEvent("shop_1", "invoice.created", "invoice_1");
    expect(callsTo("invoice.findFirst")[0].args.where).toMatchObject({ shopId: "shop_1", id: "invoice_1" });
    expect(callsTo("invoice.findFirst")[0].args.select).toHaveProperty("refunds");
    expect(callsTo("webhookDelivery.createMany")[0].args.data).toMatchObject([{ shopId: "shop_1", payload: { data: { totals: { balanceCents: 2000, netPaidCents: 8000, refundedCents: 2000 } } } }]);
  });
});
