import { randomUUID } from "node:crypto";

import { appUrl } from "@/lib/comms/config";
import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import { settleGatewayPayment } from "../settle-gateway";
import { squareRequest } from "./api";
import { withSquareConnection } from "./connect";

type PaymentLinkResponse = {
  payment_link?: { id?: string; order_id?: string; url?: string };
};

export async function createSquareInvoicePaymentLink(input: {
  shopId: string;
  invoiceId: string;
  customerId?: string;
}): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const invoice = await db.invoice.findFirst({
    where: {
      id: input.invoiceId,
      shopId: input.shopId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
    select: {
      id: true,
      number: true,
      publicToken: true,
      status: true,
      taxRateBps: true,
      customer: { select: { email: true } },
      shop: { select: { currency: true } },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
    },
  });
  if (!invoice || invoice.status === "VOID") return { ok: false, reason: "That invoice cannot be paid." };
  const amountCents = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments).balanceCents;
  if (amountCents <= 0) return { ok: false, reason: "That invoice is already paid." };

  try {
    const url = await withSquareConnection(input.shopId, async (connection) => {
      const locationId = connection.settings.locationId;
      if (!locationId) throw new Error("Square has no active business location.");
      const result = await squareRequest<PaymentLinkResponse>({
        path: "/v2/online-checkout/payment-links",
        method: "POST",
        accessToken: connection.accessToken,
        body: {
          idempotency_key: randomUUID(),
          order: {
            location_id: locationId,
            reference_id: `rp:invoice:${invoice.id}`,
            line_items: [{
              name: `RepairPilot invoice ${invoice.number}`,
              quantity: "1",
              base_price_money: { amount: amountCents, currency: invoice.shop.currency.toUpperCase() },
            }],
          },
          checkout_options: {
            redirect_url: `${appUrl()}/portal/i/${invoice.publicToken}?paid=1`,
          },
          ...(invoice.customer.email
            ? { pre_populated_data: { buyer_email: invoice.customer.email } }
            : {}),
        },
      });
      if (!result.payment_link?.url) throw new Error("Square did not return a payment link.");
      return result.payment_link.url;
    });
    return url ? { ok: true, url } : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not create Square payment link." };
  }
}

export type SquarePaymentEvent = {
  id?: string;
  status?: string;
  order_id?: string;
  amount_money?: { amount?: number; currency?: string };
  card_details?: { card?: { last_4?: string }; card_payment_timeline?: { captured_at?: string } };
};

type OrderResponse = { order?: { id?: string; reference_id?: string } };

export async function settleSquarePayment(input: {
  shopId: string;
  payment: SquarePaymentEvent;
}): Promise<{ status: "recorded" | "ignored" | "error"; reason?: string }> {
  const paymentId = input.payment.id?.trim();
  if (!paymentId || input.payment.status !== "COMPLETED") {
    return { status: "ignored", reason: `payment ${input.payment.status ?? "unknown"}` };
  }
  const orderId = input.payment.order_id?.trim();
  if (!orderId) return { status: "ignored", reason: "payment has no RepairPilot order" };

  try {
    const invoiceId = await withSquareConnection(input.shopId, async (connection) => {
      const result = await squareRequest<OrderResponse>({
        path: `/v2/orders/${encodeURIComponent(orderId)}`,
        accessToken: connection.accessToken,
      });
      const reference = result.order?.reference_id;
      return reference?.startsWith("rp:invoice:")
        ? reference.slice("rp:invoice:".length)
        : null;
    });
    if (!invoiceId) return { status: "ignored", reason: "order is not one of ours" };
    return settleGatewayPayment({
      provider: "square",
      shopId: input.shopId,
      invoiceId,
      amountCents: Math.round(Number(input.payment.amount_money?.amount ?? 0)),
      paymentId,
      chargeId: orderId,
      source: "online",
      reference: paymentId,
    });
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "Square settlement failed." };
  }
}
