"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createCardSetupCheckout, paymentsLive, removeCardOnFile } from "@/lib/payments";

/**
 * Card on file — the two buttons on a customer's Payment methods card.
 *
 * WHAT "SAVE A CARD" ACTUALLY DOES: it opens a Stripe-hosted page in setup
 * mode and hands back its URL for the browser to navigate to. The card is
 * typed on Stripe's page, not ours, and comes back as a payment method id plus
 * four display fields via the webhook. There is no card input in this app and
 * this action does not want one.
 *
 * Both actions are till-level work — an owner or front desk. A technician has
 * no reason to attach a payment instrument to a customer, the same rule store
 * credit follows next door in ./credit-actions.ts.
 */

export type CardActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Opens the hosted setup page. The client navigates to `url`. */
export async function startSaveCardAction(
  customerId: string,
): Promise<CardActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER" && role !== "FRONT_DESK") {
    return { ok: false, error: "Only an owner or front desk can save a card." };
  }
  if (!paymentsLive()) {
    return {
      ok: false,
      error:
        "Online payments are not configured — a card cannot be saved until Stripe is set up.",
    };
  }

  // Scoped inside createCardSetupCheckout by `{ id, shopId }`, so a forged
  // customer id from another tenant finds nothing.
  const result = await createCardSetupCheckout(shopId, String(customerId ?? ""));
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: result.reason };
}

export type RemoveCardResult = { ok: true } | { ok: false; error: string };

/**
 * Detaches the card at Stripe and clears the display fields here.
 *
 * Any recurring schedule set to auto-charge this customer will start failing
 * on its next run and say so on the schedule — which is the honest outcome, and
 * better than silently switching a contract to "someone will notice eventually".
 */
export async function removeCardAction(
  customerId: string,
): Promise<RemoveCardResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER" && role !== "FRONT_DESK") {
    return { ok: false, error: "Only an owner or front desk can remove a card." };
  }

  const result = await removeCardOnFile(shopId, String(customerId ?? ""));
  revalidatePath(`/customers/${customerId}`);

  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}
