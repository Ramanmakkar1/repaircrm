"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { newRecordLocationId } from "@/lib/location";
import { createPosTerminalIntent } from "@/lib/payments";
import { createSquarePosTerminalCheckout } from "@/lib/payments/square";
import type { CheckoutInput, CheckoutResult } from "@/components/pos/types";
import { performCheckout, priceCart } from "./checkout";

/**
 * The only way into a POS sale.
 *
 * A `"use server"` export is a public POST endpoint, so this function's whole
 * job is the tenant boundary: the shop and the cashier come from the session
 * cookie and nowhere else, and are never read from the payload. Everything
 * after that — validation, pricing, the transaction — lives in ./checkout,
 * which is a plain server module precisely so it cannot be called directly
 * from the wire with a `shopId` of the caller's choosing.
 */
export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const { shopId, userId } = await requireUser();

  // The branch stamped on the sale comes from the session too — the register
  // is standing somewhere, and the payload does not get a say in where.
  const locationId = await newRecordLocationId(shopId, userId);

  const result = await performCheckout({ shopId, userId, locationId }, input);

  if (result.ok) {
    // Stock moved and a paid invoice exists, so every screen that counts either
    // one is now stale.
    revalidatePath("/pos");
    revalidatePath("/invoices");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");

    // A sale that billed a ticket also changed that ticket: its charges are now
    // locked to an invoice and it has a new comment on the timeline.
    if (result.ticketId) {
      revalidatePath("/tickets");
      revalidatePath(`/tickets/${result.ticketId}`);
    }
  }

  return result;
}

/**
 * Opens a card-present PaymentIntent for the cart currently on screen.
 *
 * WHY THE REGISTER IS DIFFERENT FROM AN INVOICE. On an invoice the balance
 * already exists, so /api/payments/terminal/intent can price it from the
 * database. At the counter there is no invoice yet — the sale is only written
 * once the money is taken — so the cart has to be priced first. That pricing
 * runs through `priceCart`, which is the SAME catalogue lookup the sale itself
 * uses (see ./checkout.ts), so the amount on the reader is the amount the
 * invoice will be rung up for and neither comes from the browser.
 *
 * The intent id then travels back through `checkoutAction`, which retrieves it
 * from Stripe and refuses the sale unless the shop and amount both agree.
 */
export async function posTerminalIntentAction(
  input: CheckoutInput,
): Promise<
  | { ok: true; paymentIntentId: string; clientSecret: string | null; amountCents: number }
  | { ok: false; error: string }
> {
  const { shopId } = await requireUser();

  const priced = await priceCart(shopId, input);
  if (!priced.ok) return { ok: false, error: priced.error };

  // Stable for a given cart, so re-presenting a card after a dropped reader
  // connection re-uses the intent instead of opening a second one.
  const cartKey = createHash("sha1")
    .update(
      JSON.stringify(
        input.lines.map((line) => [
          line.productId,
          line.ticketChargeId ?? null,
          line.quantity,
          line.description,
          line.unitPriceCents,
        ]),
      ),
    )
    .digest("hex")
    .slice(0, 16);

  const result = await createPosTerminalIntent({
    shopId,
    amountCents: priced.totalCents,
    cartKey,
  });
  if (!result.ok) return { ok: false, error: result.reason };

  return {
    ok: true,
    paymentIntentId: result.intent.id,
    clientSecret: result.intent.clientSecret,
    amountCents: result.intent.amountCents,
  };
}

export async function posSquareTerminalCheckoutAction(
  input: CheckoutInput,
  deviceId: string,
): Promise<
  | { ok: true; checkoutId: string; amountCents: number }
  | { ok: false; error: string }
> {
  const { shopId } = await requireUser();
  const priced = await priceCart(shopId, input);
  if (!priced.ok) return { ok: false, error: priced.error };
  const key = createHash("sha1")
    .update(JSON.stringify(input.lines.map((line) => [
      line.productId,
      line.ticketChargeId ?? null,
      line.quantity,
      line.description,
      line.unitPriceCents,
    ])))
    .digest("hex")
    .slice(0, 16);
  const result = await createSquarePosTerminalCheckout({
    shopId,
    amountCents: priced.totalCents,
    deviceId: String(deviceId ?? ""),
    cartKey: key,
  });
  return result.ok
    ? { ok: true, checkoutId: result.checkoutId, amountCents: result.amountCents }
    : { ok: false, error: result.reason };
}
