import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", () => ({ db: fakeClient }));
vi.mock("@/lib/events", () => ({ emitInvoiceEvent: vi.fn(), emitPaymentEvent: vi.fn() }));
vi.mock("@/lib/portal-session", () => ({ requirePortalCustomer: async () => ({ id: "customer_1", shopId: "shop_1", firstName: "Test", lastName: "Customer" }), getPortalSession: async () => null }));
vi.mock("@/lib/payments", () => ({ paymentsLive: () => false, isStripeReference: () => false }));
vi.mock("@/lib/payments/config", () => ({ paymentsLive: () => true, paymentsCurrency: () => "cad", currencySupported: () => true }));
vi.mock("@/lib/payments/account", () => ({ accountFor: async () => null }));
vi.mock("@/lib/comms/config", () => ({ appUrl: () => "https://test.example" }));
vi.mock("@/lib/payments/stripe", () => ({ stripeFetch: vi.fn(async () => ({ ok: true, data: { id: "cs_test", url: "https://checkout.test.example" } })) }));
vi.mock("@/lib/payments/square", () => ({ squareConnectionStatus: async () => ({ connected: false }) }));
vi.mock("@/app/portal/_components/shop", () => ({ loadPortalShop: async () => ({ name: "Test Shop", timezone: "America/Edmonton", phone: null, address: "", logoUrl: null, mapUrl: "", hours: [] }) }));
vi.mock("@/app/portal/_components/pay-online", () => ({ PayOnlineButton: () => null }));
vi.mock("@/components/billing/print-sheet", () => ({ PrintSheet: ({ totals }: { totals: { label: string; value: string }[] }) => createElement("div", null, totals.map(row => createElement("p", { key: row.label }, `${row.label}: ${row.value}`))) }));
vi.mock("@/app/portal/_components/print-root", () => ({ PortalPrintRoot: ({ children }: {children: ReactNode}) => children, addressLines: () => [] }));

const { default: InvoicePage } = await import("@/app/portal/invoices/[id]/page");
const { default: InvoicePrintPage } = await import("@/app/portal/invoices/[id]/print/page");
const { settleStripePayment } = await import("@/lib/payments/settle");
const { createInvoiceCheckout } = await import("@/lib/payments/checkout");
const { stripeFetch } = await import("@/lib/payments/stripe");
const { settleGatewayPayment } = await import("@/lib/payments/settle-gateway");

const at = new Date("2026-10-04T12:00:00Z");
function invoice() {
  return { id: "invoice_1", shopId: "shop_1", number: 1001, publicToken: "public_test", shop: { name: "Test Shop" }, status: "PARTIAL", createdAt: at, paidAt: null, dueDate: null, notes: null, taxRateBps: 0, taxRate: null,
    customer: { firstName: "Test", lastName: "Customer", businessName: null },
    lines: [{id:"line_1",description:"Repair",quantity:1,unitPriceCents:10000,taxable:false,serial:null,warrantyDays:null}],
    payments: [{id:"pay_1",amountCents:10000,createdAt:at,method:"CARD",reference:null}],
    refunds: [{id:"refund_1",amountCents:2000,status:"completed",createdAt:at,method:"CARD",reason:null}],
  };
}

describe("independent refund cross-surface verification", () => {
  beforeEach(() => {
    resetDb();
    vi.clearAllMocks();
    handlers["invoice.findFirst"] = invoice;
    handlers["shop.findUnique"] = () => ({ name: "Test Shop", timezone: "America/Edmonton", taxRateBps: 0, logoUrl: null, phone: null, email: null });
  });

  it("customer invoice shows the same $20 debt as the staff screen after a refund", async () => {
    const html = renderToStaticMarkup(await InvoicePage({params:Promise.resolve({id:"invoice_1"}),searchParams:Promise.resolve({})}));
    expect(html).toContain("$20.00");
    expect(html).not.toContain("Paid, thank you");
    expect(html).toContain("Money returned");
    expect(callsTo("invoice.findFirst")[0].args.select).toHaveProperty("refunds");
    expect(callsTo("invoice.findFirst")[0].args.where).toMatchObject({id:"invoice_1",shopId:"shop_1",customerId:"customer_1",status:{not:"DRAFT"}});
  });

  it("customer PDF shows $20 balance due, matching the staff copy", async () => {
    const html = renderToStaticMarkup(await InvoicePrintPage({params:Promise.resolve({id:"invoice_1"})}));
    expect(html).toContain("Balance due: $20.00");
    expect(html).toContain("Money returned: $20.00");
    expect(callsTo("invoice.findFirst")[0].args.include).toHaveProperty("refunds");
  });

  it("settling only $10 of a reopened $20 debt keeps the invoice part paid", async () => {
    handlers["payment.findFirst"] = () => null;
    handlers["payment.create"] = () => ({ id: "new_payment" });
    handlers["invoice.update"] = () => ({ id: "invoice_1" });
    const result = await settleGatewayPayment({ provider:"square",shopId:"shop_1",invoiceId:"invoice_1",amountCents:1000,paymentId:"new_gateway_payment",source:"online" });
    expect(result).toMatchObject({status:"recorded",invoiceStatus:"PARTIAL"});
    expect(callsTo("invoice.update")[0].args.data).toMatchObject({status:"PARTIAL",paidAt:null});
  });

  it("Stripe settlement also keeps a partially repaid refunded invoice open", async () => {
    handlers["payment.findFirst"] = () => null;
    handlers["payment.create"] = () => ({ id: "stripe_payment" });
    handlers["invoice.update"] = () => ({ id: "invoice_1" });
    const result = await settleStripePayment({ shopId:"shop_1", invoiceId:"invoice_1", amountCents:1000, reference:"cs_refund", paymentIntentId:"pi_test", chargeId:null, source:"checkout" });
    expect(result).toMatchObject({status:"recorded",invoiceStatus:"PARTIAL"});
    expect(callsTo("invoice.findFirst")[0].args.select).toHaveProperty("refunds");
    expect(callsTo("invoice.update")[0].args.data).toMatchObject({status:"PARTIAL",paidAt:null});
  });

  it.each(["completed", "pending"])("online checkout charges only the 2,000-cent reopened balance for a %s refund", async (status) => {
    handlers["invoice.findFirst"] = () => ({...invoice(),refunds:[{amountCents:2000,status}]});
    const result = await createInvoiceCheckout("invoice_1", { shopId:"shop_1",customerId:"customer_1" });
    expect(result).toMatchObject({ok:true});
    expect(vi.mocked(stripeFetch).mock.calls[0][1]).toMatchObject({body:{"line_items[0][price_data][unit_amount]":"2000"}});
    expect(callsTo("invoice.findFirst")[0].args.select).toHaveProperty("refunds");
    expect(callsTo("invoice.findFirst")[0].args.where).toMatchObject({shopId:"shop_1",customerId:"customer_1"});
  });

  it("a failed refund does not reopen online checkout or the customer balance", async () => {
    handlers["invoice.findFirst"] = () => ({...invoice(),refunds:[{amountCents:2000,status:"failed"}]});
    const result = await createInvoiceCheckout("invoice_1", { shopId:"shop_1",customerId:"customer_1" });
    expect(result).toMatchObject({ok:false});
    expect(stripeFetch).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(await InvoicePage({params:Promise.resolve({id:"invoice_1"}),searchParams:Promise.resolve({})}));
    expect(html).toContain("Paid, thank you");
    expect(html).not.toContain("Money returned");
  });

  it("retries reuse checkout, but repayment followed by another refund starts a new checkout for the same balance", async () => {
    await createInvoiceCheckout("invoice_1", { shopId: "shop_1", customerId: "customer_1" });
    await createInvoiceCheckout("invoice_1", { shopId: "shop_1", customerId: "customer_1" });
    handlers["invoice.findFirst"] = () => ({
      ...invoice(),
      payments: [...invoice().payments, { amountCents: 2000 }],
      refunds: [...invoice().refunds, { amountCents: 2000, status: "completed" }],
    });
    await createInvoiceCheckout("invoice_1", { shopId: "shop_1", customerId: "customer_1" });
    const requests = vi.mocked(stripeFetch).mock.calls.map((call) => call[1]);
    expect(requests).toHaveLength(3);
    expect(requests[0]?.idempotencyKey).toBeDefined();
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey);
    expect(requests[2]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
    for (const request of requests) expect(request?.body).toMatchObject({ "line_items[0][price_data][unit_amount]": "2000" });
  });

});
