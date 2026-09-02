"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { disconnectShop, registerReader } from "@/lib/payments";
import type { TerminalReader } from "@/lib/payments";

/**
 * Payments settings: the two things a shop owner can change from this screen.
 *
 * Everything else on the Payments tab is READ-ONLY — the connection state, the
 * account's charges/payouts flags, the webhook endpoint — because none of it
 * is ours to edit. The account lives at Stripe and the keys live in the
 * server's environment; a form here that pretended otherwise would be a form
 * that lies.
 *
 * Both actions are OWNER-only and both re-derive the shop from the session.
 * Disconnecting a payment processor and pairing hardware to a shop are not
 * front-desk decisions, and neither takes a shopId from the caller.
 */

export type PaymentsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Revokes the platform's access to the shop's Stripe account.
 *
 * The shop keeps working afterwards: with no `stripeAccountId` it falls back
 * to direct mode on the platform key, which is how every shop ran before
 * Connect existed. Nothing about invoices, payments or refunds already
 * recorded changes — those are facts, and this is a credential.
 */
export async function disconnectStripeAction(): Promise<PaymentsActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can disconnect Stripe." };
  }

  const result = await disconnectShop(shopId);
  revalidatePath("/settings");

  if (!result.ok) {
    // The local connection is cleared either way — see disconnectShop — so
    // this is a warning about Stripe's side, not a failed operation.
    return {
      ok: false,
      error: `Disconnected here, but Stripe reported: ${result.reason}. Revoke the app from your Stripe dashboard to be sure.`,
    };
  }
  return { ok: true, message: "Stripe account disconnected." };
}

export type RegisterReaderResult =
  | { ok: true; reader: TerminalReader }
  | { ok: false; error: string };

/**
 * Pairs a card reader with this shop.
 *
 * The registration code is the three-word phrase the reader shows on its own
 * screen, so physical possession of the hardware is what authorises the
 * pairing. A Terminal Location is created from the shop's address on the first
 * registration (see lib/payments/terminal.ts) — which is why an incomplete
 * shop address comes back as a sentence telling the owner exactly where to go.
 */
export async function registerReaderAction(input: {
  registrationCode: string;
  label: string;
}): Promise<RegisterReaderResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can register a card reader." };
  }

  const result = await registerReader({
    shopId,
    registrationCode: String(input.registrationCode ?? ""),
    label: String(input.label ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/settings");
  return { ok: true, reader: result.reader };
}
