"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  disconnectShop,
  ensureShopWebhook,
  forgetReader,
  registerReader,
  registerSimulatedReader,
  renameReader,
  runPaymentsHealthCheck,
} from "@/lib/payments";
import type { PaymentsHealth, TerminalReader } from "@/lib/payments";
import {
  createSquareDeviceCode,
  disconnectSquare,
} from "@/lib/payments/square";

/**
 * Payments settings: everything a shop owner can change from this screen.
 *
 * Connecting Stripe, pairing a card machine, naming it, removing it, retrying
 * the automatic setup, and running the self-check. What is NOT here is the
 * account's own state — charges enabled, payouts enabled, the bank on file —
 * because none of that is ours to edit. It lives at Stripe, and a form here
 * that pretended otherwise would be a form that lies.
 *
 * Every action is OWNER-only and every one re-derives the shop from the
 * session. Choosing a payment processor and pairing hardware to a shop are not
 * front-desk decisions, and none of these takes a shopId from the caller.
 *
 * A reader id DOES arrive from the browser, in rename and remove. It is never
 * believed: `lib/payments/terminal.ts` retrieves the reader from Stripe and
 * refuses it unless it is registered to this shop's own Terminal location.
 */

export type PaymentsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function disconnectSquareAction(): Promise<PaymentsActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { ok: false, error: "Only the shop owner can disconnect Square." };
  await disconnectSquare(shopId);
  revalidatePath("/settings");
  return { ok: true, message: "Square account disconnected." };
}

export async function createSquareDeviceCodeAction(input: { name: string }): Promise<
  | { ok: true; code: string; deviceId: string; pairBy: string | null }
  | { ok: false; error: string }
> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { ok: false, error: "Only the shop owner can pair a Square Terminal." };
  const result = await createSquareDeviceCode({ shopId, name: String(input.name ?? "") });
  if (!result.ok) return { ok: false, error: result.reason };
  revalidatePath("/settings");
  return {
    ok: true,
    code: result.device.code ?? "",
    deviceId: result.device.id,
    pairBy: result.device.pairBy ?? null,
  };
}

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
    return { ok: false, error: "Only the shop owner can connect a card machine." };
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

// ---------------------------------------------------------------------------
// Card machines
// ---------------------------------------------------------------------------

export type ReaderActionResult =
  | { ok: true; reader: TerminalReader }
  | { ok: false; error: string };

/**
 * Adds Stripe's practice reader — software, no hardware.
 *
 * The whole counter flow can then be walked through before the box arrives,
 * which is the difference between a shop that trusts the till on day one and a
 * shop that discovers on day one that nobody knows where to tap. Refused on
 * live keys inside `registerSimulatedReader`.
 */
export async function pairPracticeReaderAction(input: {
  label: string;
}): Promise<ReaderActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can add a card machine." };
  }

  const result = await registerSimulatedReader({
    shopId,
    label: String(input.label ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/settings");
  return { ok: true, reader: result.reader };
}

/** Renames a card machine. The name is only ever shown to staff. */
export async function renameReaderAction(input: {
  readerId: string;
  label: string;
}): Promise<ReaderActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can rename a card machine." };
  }

  const result = await renameReader({
    shopId,
    readerId: String(input.readerId ?? ""),
    label: String(input.label ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/settings");
  return { ok: true, reader: result.reader };
}

/**
 * Unpairs a card machine.
 *
 * Nothing about money changes — payments taken on it are rows of their own.
 * The reader id is checked against this shop's own Terminal location inside
 * `forgetReader` before Stripe is asked to do anything.
 */
export async function forgetReaderAction(input: {
  readerId: string;
}): Promise<PaymentsActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can remove a card machine." };
  }

  const result = await forgetReader({
    shopId,
    readerId: String(input.readerId ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/settings");
  return { ok: true, message: "Card machine removed." };
}

// ---------------------------------------------------------------------------
// Getting paid
// ---------------------------------------------------------------------------

/**
 * Re-runs the automatic setup that normally happens at connect time.
 *
 * The button behind the "Automatic setup didn't finish" line. Idempotent by
 * construction — `ensureShopWebhook` lists what is already on the account
 * first, so pressing it five times leaves exactly one endpoint.
 */
export async function retryPaymentSetupAction(): Promise<PaymentsActionResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can set up payments." };
  }

  const result = await ensureShopWebhook(shopId);
  revalidatePath("/settings");

  if (result.status === "ready") {
    return {
      ok: true,
      message: "Stripe now knows where to confirm your payments.",
    };
  }
  if (result.status === "direct-mode") {
    return {
      ok: false,
      error:
        "Connect your own Stripe account first — there is nothing to set up until then.",
    };
  }
  if (result.status === "not-public") {
    return { ok: false, error: result.reason };
  }
  return { ok: false, error: result.reason };
}

/**
 * The "Test payments" button.
 *
 * Read-only and safe to press at any time, including mid-sale: it fetches, it
 * lists, and it posts one signed test message to this app's own address. It
 * never charges anything.
 */
export async function testPaymentsAction(): Promise<
  { ok: true; health: PaymentsHealth } | { ok: false; error: string }
> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only the shop owner can test payments." };
  }
  return { ok: true, health: await runPaymentsHealthCheck(shopId) };
}
