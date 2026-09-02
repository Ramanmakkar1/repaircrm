"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { newRecordLocationId } from "@/lib/location";
import type { CheckoutInput, CheckoutResult } from "@/components/pos/types";
import { performCheckout } from "./checkout";

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
