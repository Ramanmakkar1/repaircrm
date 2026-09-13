import { createHmac, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { inspectSquareTerminalCheckout } from "./terminal";
import { settleSquarePayment, type SquarePaymentEvent } from "./online";
import { squareWebhookSignatureKey, squareWebhookUrl } from "./config";

function safeEqualBase64(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "base64");
    const right = Buffer.from(b, "base64");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/** Square signs `notification URL + raw request body` with HMAC-SHA256. */
export function verifySquareSignature(input: {
  body: string;
  signature: string | null;
  signatureKey?: string | null;
  notificationUrl?: string;
}): boolean {
  const key = input.signatureKey ?? squareWebhookSignatureKey();
  if (!key || !input.signature) return false;
  const expected = createHmac("sha256", key)
    .update(`${input.notificationUrl ?? squareWebhookUrl()}${input.body}`, "utf8")
    .digest("base64");
  return safeEqualBase64(input.signature, expected);
}

type SquareWebhook = {
  type?: string;
  merchant_id?: string;
  data?: {
    object?: {
      checkout?: { id?: string; status?: string };
      payment?: SquarePaymentEvent;
    };
  };
};

export async function applySquareWebhook(event: SquareWebhook): Promise<{
  status: "recorded" | "ignored" | "error";
  reason?: string;
}> {
  const merchantId = event.merchant_id?.trim();
  if (!merchantId) return { status: "ignored", reason: "missing merchant" };
  const connection = await db.integrationConnection.findFirst({
    where: { provider: "square", remoteTenantId: merchantId, status: "connected" },
    select: { shopId: true },
  });
  if (!connection) return { status: "ignored", reason: "merchant is not connected" };

  if (event.type === "terminal.checkout.updated") {
    const checkout = event.data?.object?.checkout;
    if (!checkout?.id || checkout.status !== "COMPLETED") {
      return { status: "ignored", reason: `checkout ${checkout?.status ?? "unknown"}` };
    }
    const result = await inspectSquareTerminalCheckout({
      shopId: connection.shopId,
      checkoutId: checkout.id,
    });
    if (!result.ok) return { status: "error", reason: result.reason };
    return result.status === "completed"
      ? { status: "recorded" }
      : { status: "ignored", reason: result.status };
  }

  if (event.type === "payment.updated") {
    const payment = event.data?.object?.payment;
    if (!payment) return { status: "ignored", reason: "missing payment" };
    return settleSquarePayment({ shopId: connection.shopId, payment });
  }

  // payment.updated is retained for visibility and future hosted-checkout
  // adapters. Terminal money is settled from terminal.checkout.updated because
  // that object carries RepairPilot's invoice reference.
  return { status: "ignored", reason: `event ${event.type ?? "unknown"}` };
}
