import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import { settleGatewayPayment } from "../settle-gateway";
import { squareRequest } from "./api";
import { withSquareConnection } from "./connect";

export type SquareDevice = {
  id: string;
  name: string;
  code?: string | null;
  status: string;
  deviceId?: string | null;
  locationId?: string | null;
  pairBy?: string | null;
};

type DeviceCodeResponse = {
  device_code?: {
    id?: string;
    name?: string;
    code?: string;
    status?: string;
    device_id?: string;
    location_id?: string;
    pair_by?: string;
  };
};

function deviceOf(data: NonNullable<DeviceCodeResponse["device_code"]>): SquareDevice {
  return {
    id: data.id ?? "",
    name: data.name?.trim() || "Square Terminal",
    code: data.code ?? null,
    status: data.status ?? "UNKNOWN",
    deviceId: data.device_id ?? null,
    locationId: data.location_id ?? null,
    pairBy: data.pair_by ?? null,
  };
}

export async function createSquareDeviceCode(input: {
  shopId: string;
  name: string;
}): Promise<{ ok: true; device: SquareDevice } | { ok: false; reason: string }> {
  try {
    const result = await withSquareConnection(input.shopId, async (connection) => {
      const locationId = connection.settings.locationId;
      if (!locationId) throw new Error("Square has no active business location. Add one in Square first.");
      const data = await squareRequest<DeviceCodeResponse>({
        path: "/v2/devices/codes",
        method: "POST",
        accessToken: connection.accessToken,
        body: {
          idempotency_key: randomUUID(),
          device_code: {
            name: input.name.trim().slice(0, 60) || "RepairPilot counter",
            product_type: "TERMINAL_API",
            location_id: locationId,
          },
        },
      });
      if (!data.device_code?.id || !data.device_code.code) {
        throw new Error("Square did not return a device pairing code.");
      }
      return deviceOf(data.device_code);
    });
    return result ? { ok: true, device: result } : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not pair Square Terminal." };
  }
}

type DevicesResponse = {
  devices?: Array<{
    id?: string;
    attributes?: {
      name?: string;
      type?: string;
      manufacturer?: string;
      model?: string;
      status?: string;
      updated_at?: string;
      version?: string;
    };
    components?: Array<{ type?: string; application_details?: { application_type?: string } }>;
  }>;
};

export async function listSquareDevices(shopId: string): Promise<SquareDevice[]> {
  try {
    const result = await withSquareConnection(shopId, async (connection) => {
      const data = await squareRequest<DevicesResponse>({
        path: "/v2/devices",
        accessToken: connection.accessToken,
      });
      return (data.devices ?? []).map((device) => ({
        id: device.id ?? "",
        deviceId: device.id ?? null,
        name: device.attributes?.name?.trim() || [device.attributes?.manufacturer, device.attributes?.model].filter(Boolean).join(" ") || "Square Terminal",
        status: device.attributes?.status ?? "UNKNOWN",
        locationId: connection.settings.locationId ?? null,
      })).filter((device) => device.id);
    });
    return result ?? [];
  } catch {
    return [];
  }
}

type TerminalCheckout = {
  id?: string;
  status?: string;
  reference_id?: string;
  payment_ids?: string[];
  amount_money?: { amount?: number; currency?: string };
};

type TerminalCheckoutResponse = { checkout?: TerminalCheckout };
type SquarePaymentResponse = {
  payment?: {
    id?: string;
    status?: string;
    amount_money?: { amount?: number; currency?: string };
    card_details?: { card_payment_timeline?: { captured_at?: string } };
  };
};

export async function createSquareTerminalCheckout(input: {
  shopId: string;
  invoiceId: string;
  deviceId: string;
}): Promise<{ ok: true; checkoutId: string; amountCents: number } | { ok: false; reason: string }> {
  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId, shopId: input.shopId },
    select: {
      id: true,
      number: true,
      status: true,
      taxRateBps: true,
      shop: { select: { currency: true } },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
    },
  });
  if (!invoice || invoice.status === "VOID") return { ok: false, reason: "That invoice cannot be paid." };
  const amountCents = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments).balanceCents;
  if (amountCents <= 0) return { ok: false, reason: "That invoice is already paid." };

  try {
    const checkoutId = await withSquareConnection(input.shopId, async (connection) => {
      const data = await squareRequest<TerminalCheckoutResponse>({
        path: "/v2/terminals/checkouts",
        method: "POST",
        accessToken: connection.accessToken,
        body: {
          idempotency_key: `rp-invoice-${invoice.id}-${amountCents}`,
          checkout: {
            amount_money: { amount: amountCents, currency: invoice.shop.currency.toUpperCase() },
            device_options: { device_id: input.deviceId },
            reference_id: `rp:invoice:${invoice.id}`,
            note: `RepairPilot invoice ${invoice.number}`,
          },
        },
      });
      if (!data.checkout?.id) throw new Error("Square did not start the terminal checkout.");
      return data.checkout.id;
    });
    return checkoutId
      ? { ok: true, checkoutId, amountCents }
      : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not start Square Terminal." };
  }
}

export async function createSquarePosTerminalCheckout(input: {
  shopId: string;
  amountCents: number;
  deviceId: string;
  cartKey: string;
}): Promise<{ ok: true; checkoutId: string; amountCents: number } | { ok: false; reason: string }> {
  const shop = await db.shop.findUnique({ where: { id: input.shopId }, select: { currency: true } });
  const amountCents = Math.round(input.amountCents);
  if (!shop || amountCents <= 0) return { ok: false, reason: "That cart cannot be charged." };
  try {
    const checkoutId = await withSquareConnection(input.shopId, async (connection) => {
      const data = await squareRequest<TerminalCheckoutResponse>({
        path: "/v2/terminals/checkouts",
        method: "POST",
        accessToken: connection.accessToken,
        body: {
          idempotency_key: `rp-pos-${input.shopId}-${input.cartKey}-${amountCents}`,
          checkout: {
            amount_money: { amount: amountCents, currency: shop.currency.toUpperCase() },
            device_options: { device_id: input.deviceId },
            reference_id: `rp:pos:${input.shopId}:${input.cartKey}`,
            note: "RepairPilot counter sale",
          },
        },
      });
      if (!data.checkout?.id) throw new Error("Square did not start the terminal checkout.");
      return data.checkout.id;
    });
    return checkoutId
      ? { ok: true, checkoutId, amountCents }
      : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not start Square Terminal." };
  }
}

export async function verifySquarePosTerminalCheckout(input: {
  shopId: string;
  checkoutId: string;
}): Promise<
  | { ok: true; status: "pending" | "completed" | "canceled"; paymentId?: string; amountCents?: number }
  | { ok: false; reason: string }
> {
  try {
    const result = await withSquareConnection(input.shopId, async (connection) => {
      const data = await squareRequest<TerminalCheckoutResponse>({
        path: `/v2/terminals/checkouts/${encodeURIComponent(input.checkoutId)}`,
        accessToken: connection.accessToken,
      });
      const checkout = data.checkout;
      if (!checkout?.id) throw new Error("Square checkout was not found.");
      if (checkout.status === "CANCELED" || checkout.status === "CANCEL_REQUESTED") {
        return { status: "canceled" as const };
      }
      if (checkout.status !== "COMPLETED") return { status: "pending" as const };
      if (!checkout.reference_id?.startsWith(`rp:pos:${input.shopId}:`)) {
        throw new Error("That Square checkout does not belong to this register.");
      }
      const paymentId = checkout.payment_ids?.[0];
      if (!paymentId) throw new Error("Square checkout has no completed payment.");
      const paymentData = await squareRequest<SquarePaymentResponse>({
        path: `/v2/payments/${encodeURIComponent(paymentId)}`,
        accessToken: connection.accessToken,
      });
      const payment = paymentData.payment;
      if (payment?.status !== "COMPLETED" || !payment.id) {
        return { status: "pending" as const };
      }
      return {
        status: "completed" as const,
        paymentId: payment.id,
        amountCents: Math.round(Number(payment.amount_money?.amount ?? 0)),
      };
    });
    return result ? { ok: true, ...result } : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not verify Square payment." };
  }
}

export async function inspectSquareTerminalCheckout(input: {
  shopId: string;
  checkoutId: string;
  takenById?: string | null;
}): Promise<
  | { ok: true; status: "pending" | "completed" | "canceled"; amountCents?: number }
  | { ok: false; reason: string }
> {
  try {
    const result = await withSquareConnection(input.shopId, async (connection) => {
      const data = await squareRequest<TerminalCheckoutResponse>({
        path: `/v2/terminals/checkouts/${encodeURIComponent(input.checkoutId)}`,
        accessToken: connection.accessToken,
      });
      const checkout = data.checkout;
      if (!checkout?.id) throw new Error("Square checkout was not found.");
      if (checkout.status === "CANCELED" || checkout.status === "CANCEL_REQUESTED") {
        return { status: "canceled" as const };
      }
      if (checkout.status !== "COMPLETED") return { status: "pending" as const };
      const invoiceId = checkout.reference_id?.startsWith("rp:invoice:")
        ? checkout.reference_id.slice("rp:invoice:".length)
        : null;
      const paymentId = checkout.payment_ids?.[0];
      if (!invoiceId || !paymentId) throw new Error("Completed Square checkout is missing its RepairPilot reference.");
      const paymentData = await squareRequest<SquarePaymentResponse>({
        path: `/v2/payments/${encodeURIComponent(paymentId)}`,
        accessToken: connection.accessToken,
      });
      const payment = paymentData.payment;
      if (payment?.status !== "COMPLETED" || !payment.id) {
        throw new Error("Square has not confirmed the payment yet.");
      }
      const amountCents = Math.round(Number(payment.amount_money?.amount ?? 0));
      const outcome = await settleGatewayPayment({
        provider: "square",
        shopId: input.shopId,
        invoiceId,
        amountCents,
        paymentId: payment.id,
        chargeId: checkout.id,
        source: "terminal",
        reference: payment.id,
        takenById: input.takenById,
      });
      if (outcome.status === "error") throw new Error(outcome.reason);
      return { status: "completed" as const, amountCents };
    });
    return result
      ? { ok: true, ...result }
      : { ok: false, reason: "Connect Square first." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not verify Square payment." };
  }
}
