/**
 * Stripe Terminal — taking a card at the counter.
 *
 * HOW THE PIECES FIT
 * ------------------
 *   1. The browser asks this server for a CONNECTION TOKEN. It is short-lived
 *      and scoped to one reader session, which is why it is the only Stripe
 *      credential the register is ever allowed to hold. The secret key stays
 *      here.
 *   2. Stripe's terminal.js discovers and connects to a reader.
 *   3. This server creates a PAYMENT INTENT for the amount owed, with
 *      `payment_method_types=["card_present"]`.
 *   4. The reader collects the card and processes the intent.
 *   5. The browser tells this server the intent id, and this server RETRIEVES
 *      that intent from Stripe before writing anything down — see
 *      `verifyTerminalIntent`. An id from a browser is a claim, not a receipt.
 *
 * LOCATIONS
 * ---------
 * Stripe requires every reader to belong to a Terminal Location, which is
 * essentially the shop's street address. Rather than adding another form for
 * an owner to fill in, one is created lazily from the address already in
 * Settings → Shop and its id parked in `Shop.settings.stripeTerminalLocationId`
 * — the same Json blob the automation runner and the workflow tab share, merged
 * the same careful way so nothing else in it is lost.
 *
 * SIMULATED READERS
 * -----------------
 * Terminal's JS SDK can discover a fake reader, which is the only way to
 * exercise this flow without hardware. It is offered when the platform key is
 * a test key, and the browser is told nothing but a boolean — `testMode` — so
 * no part of the key shape ever reaches a client bundle.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";

import { currencySupported, paymentsCurrency, paymentsLive } from "./config";
import { accountFor } from "./account";
import { settleStripePayment, type SettleOutcome } from "./settle";
import {
  chargeIdOf,
  stripeFetch,
  stripeTestMode,
  type StripePaymentIntent,
} from "./stripe";

/** Stripe refuses a card payment below this in a two-decimal currency. */
const MIN_CHARGE_CENTS = 50;

// ---------------------------------------------------------------------------
// Shop.settings plumbing
// ---------------------------------------------------------------------------

/** Reads the stored Terminal location id, tolerating every shape the column can hold. */
export function readTerminalLocationId(
  settings: Prisma.JsonValue | null | undefined,
): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = (settings as Record<string, unknown>).stripeTerminalLocationId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Merges one key into `Shop.settings` without discarding the rest.
 *
 * `settings` is shared with the Workflow tab and the automation runner, so a
 * blind overwrite here would silently delete a shop's custom ticket statuses.
 */
function withTerminalLocation(
  current: Prisma.JsonValue | null | undefined,
  locationId: string,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return { ...base, stripeTerminalLocationId: locationId } as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export type LocationResult =
  | { ok: true; locationId: string }
  | { ok: false; reason: string };

/**
 * The shop's Terminal Location, created on first use.
 *
 * Refuses rather than invents an address: Stripe validates it, and a reader
 * registered against "1 Nowhere St" is a support ticket six months from now
 * when somebody tries to work out which shop a disputed charge came from.
 */
export async function ensureTerminalLocation(
  shopId: string,
): Promise<LocationResult> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      name: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      settings: true,
    },
  });
  if (!shop) return { ok: false, reason: "That shop no longer exists." };

  const existing = readTerminalLocationId(shop.settings);
  if (existing) return { ok: true, locationId: existing };

  if (!shop.address1?.trim() || !shop.city?.trim() || !shop.postalCode?.trim()) {
    return {
      ok: false,
      reason:
        "Stripe needs the shop's street address before a card machine can be connected — fill it in under Settings → Shop.",
    };
  }

  const account = await accountFor(shopId);
  const created = await stripeFetch<{ id?: string }>("/v1/terminal/locations", {
    method: "POST",
    account,
    idempotencyKey: `shop-${shopId}-terminal-location`,
    body: {
      display_name: shop.name,
      address: {
        line1: shop.address1.trim(),
        line2: shop.address2?.trim() || undefined,
        city: shop.city.trim(),
        state: shop.state?.trim() || undefined,
        postal_code: shop.postalCode.trim(),
        country: (shop.country || "US").trim().toUpperCase(),
      },
    },
  });

  if (!created.ok || !created.data.id) {
    return {
      ok: false,
      reason: created.ok ? "Stripe did not return a location." : created.message,
    };
  }

  await db.shop.updateMany({
    where: { id: shopId },
    data: { settings: withTerminalLocation(shop.settings, created.data.id) },
  });

  return { ok: true, locationId: created.data.id };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export type TerminalReader = {
  id: string;
  label: string;
  /** "online" | "offline" | "unknown" — Stripe's word, shown as a sentence. */
  status: string;
  deviceType: string;
  serialNumber: string | null;
  /** True for Stripe's software reader, which has no hardware behind it. */
  simulated: boolean;
  /** 0–100, or null. Stripe reports this only for readers with a battery. */
  batteryPercent: number | null;
  /** ISO timestamp of the reader's last contact with Stripe, or null. */
  lastSeenAt: string | null;
  /** The Terminal Location this reader is registered to. */
  locationId: string | null;
};

type StripeReader = {
  id: string;
  label?: string | null;
  status?: string | null;
  device_type?: string | null;
  serial_number?: string | null;
  location?: string | { id?: string } | null;
  /** Milliseconds since the epoch, per Stripe's terminal.reader object. */
  last_seen_at?: number | null;
  /** Only present on battery-powered models; 0–1. */
  battery_level?: number | null;
};

/** Stripe's own registration code for a software reader. Test keys only. */
const SIMULATED_REGISTRATION_CODE = "simulated-wpe";

/** One Stripe reader, in the shape every screen in this app reads. */
function toReader(reader: StripeReader): TerminalReader {
  const deviceType = reader.device_type ?? "unknown";
  const battery =
    typeof reader.battery_level === "number"
      ? Math.max(0, Math.min(100, Math.round(reader.battery_level * 100)))
      : null;
  const locationValue = reader.location;
  return {
    id: reader.id,
    label: reader.label ?? reader.id,
    status: reader.status ?? "unknown",
    deviceType,
    serialNumber: reader.serial_number ?? null,
    simulated: deviceType.startsWith("simulated"),
    batteryPercent: battery,
    lastSeenAt:
      typeof reader.last_seen_at === "number" && reader.last_seen_at > 0
        ? new Date(reader.last_seen_at).toISOString()
        : null,
    locationId:
      typeof locationValue === "string"
        ? locationValue
        : (locationValue?.id ?? null),
  };
}

/**
 * Stripe's pairing refusals, rewritten for someone holding the reader.
 *
 * The three that actually happen at a counter are a code that timed out while
 * the owner was finding their glasses, a reader still paired to the shop's old
 * processor, and a reader that never got onto the wifi. Stripe describes all
 * three in terms of API resources; none of those sentences tell the person
 * standing there what to press next.
 */
export function pairingMessage(code: string | null, message: string): string {
  const text = message.toLowerCase();

  if (
    code === "terminal_reader_invalid_registration_code" ||
    text.includes("registration code") ||
    text.includes("expired")
  ) {
    return "That pairing code didn't work — they only last a few minutes. On the reader, generate a new code and type it in straight away.";
  }
  if (text.includes("already been registered") || text.includes("already registered")) {
    return "This reader is already paired to a different Stripe account. Remove it there first, then generate a new pairing code on the reader.";
  }
  if (text.includes("offline") || text.includes("not reachable")) {
    return "The reader isn't answering. Check it is switched on and connected to the same wifi as this computer, then try again.";
  }
  return message;
}

/**
 * The readers registered to this shop.
 *
 * A shop with no Location yet has no readers by definition, so the absence is
 * reported as an empty list rather than as an error — "you have not set this
 * up" is not a failure, and the tab says so in its own words.
 */
export async function listReaders(
  shopId: string,
): Promise<{ ok: true; readers: TerminalReader[] } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  const locationId = readTerminalLocationId(shop?.settings);
  if (!locationId) return { ok: true, readers: [] };

  const account = await accountFor(shopId);
  const result = await stripeFetch<{ data?: StripeReader[] }>(
    "/v1/terminal/readers",
    { account, query: { location: locationId, limit: 100 } },
  );
  if (!result.ok) return { ok: false, reason: result.message };

  return { ok: true, readers: (result.data.data ?? []).map(toReader) };
}

/**
 * The reader, but only if it belongs to THIS shop.
 *
 * Rename and Forget both take an id from the browser, and an id is not a
 * claim of ownership. Stripe scopes a reader to a Terminal Location, and this
 * shop's location id is read from its own row — so a reader registered to
 * another tenant's location is refused before anything is changed.
 */
async function readerOwnedBy(
  shopId: string,
  readerId: string,
): Promise<{ ok: true; reader: TerminalReader; account: string | null } | { ok: false; reason: string }> {
  const id = readerId.trim();
  if (!id.startsWith("tmr_")) {
    return { ok: false, reason: "That is not a card machine." };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  const locationId = readTerminalLocationId(shop?.settings);
  if (!locationId) {
    return { ok: false, reason: "This shop has no card readers set up." };
  }

  const account = await accountFor(shopId);
  const result = await stripeFetch<StripeReader>(
    `/v1/terminal/readers/${encodeURIComponent(id)}`,
    { account },
  );
  if (!result.ok) return { ok: false, reason: result.message };

  const reader = toReader(result.data);
  if (reader.locationId !== locationId) {
    return { ok: false, reason: "That card reader belongs to another shop." };
  }
  return { ok: true, reader, account };
}

/** Renames a reader. Cosmetic, and the only editable thing about one. */
export async function renameReader(input: {
  shopId: string;
  readerId: string;
  label: string;
}): Promise<{ ok: true; reader: TerminalReader } | { ok: false; reason: string }> {
  const label = input.label.trim().slice(0, 60);
  if (!label) return { ok: false, reason: "Give the reader a name." };

  const owned = await readerOwnedBy(input.shopId, input.readerId);
  if (!owned.ok) return owned;

  const updated = await stripeFetch<StripeReader>(
    `/v1/terminal/readers/${encodeURIComponent(owned.reader.id)}`,
    { method: "POST", account: owned.account, body: { label } },
  );
  if (!updated.ok) return { ok: false, reason: updated.message };
  return { ok: true, reader: toReader(updated.data) };
}

/**
 * Unpairs a reader from this shop.
 *
 * Nothing about money changes: payments already taken on it are facts with
 * their own rows, and this only removes the registration. The reader can be
 * paired again from its own screen whenever it is needed.
 */
export async function forgetReader(input: {
  shopId: string;
  readerId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const owned = await readerOwnedBy(input.shopId, input.readerId);
  if (!owned.ok) return owned;

  const removed = await stripeFetch(
    `/v1/terminal/readers/${encodeURIComponent(owned.reader.id)}`,
    { method: "DELETE", account: owned.account },
  );
  if (!removed.ok) return { ok: false, reason: removed.message };
  return { ok: true };
}

/**
 * Pairs a physical reader with this shop.
 *
 * The registration code is the word triple the reader prints on its own
 * screen, so possession of the hardware is what authorises the pairing — this
 * server only has to be sure the shop asking is the shop it says it is, which
 * the session already guarantees.
 */
export async function registerReader(input: {
  shopId: string;
  registrationCode: string;
  label: string;
}): Promise<{ ok: true; reader: TerminalReader } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const code = input.registrationCode.trim();
  if (!code) return { ok: false, reason: "Enter the code shown on the reader." };

  const location = await ensureTerminalLocation(input.shopId);
  if (!location.ok) return location;

  const account = await accountFor(input.shopId);
  const created = await stripeFetch<StripeReader>("/v1/terminal/readers", {
    method: "POST",
    account,
    body: {
      registration_code: code,
      label: input.label.trim().slice(0, 60) || "Counter reader",
      location: location.locationId,
    },
  });
  if (!created.ok) {
    return { ok: false, reason: pairingMessage(created.code, created.message) };
  }

  return { ok: true, reader: toReader(created.data) };
}

/**
 * Pairs Stripe's SIMULATED reader — software, no hardware, test keys only.
 *
 * It is how a shop sees the whole counter flow before the box arrives, and how
 * this app is developed at all. Refused outright on a live key: a simulated
 * reader that approves every card would be a very convincing way to ship a
 * till that takes no money.
 */
export async function registerSimulatedReader(input: {
  shopId: string;
  label: string;
}): Promise<{ ok: true; reader: TerminalReader } | { ok: false; reason: string }> {
  if (!stripeTestMode()) {
    return {
      ok: false,
      reason:
        "A practice reader can only be added while this server is using Stripe test keys.",
    };
  }
  return registerReader({
    shopId: input.shopId,
    registrationCode: SIMULATED_REGISTRATION_CODE,
    label: input.label.trim() || "Practice reader",
  });
}

/**
 * A short-lived token the browser's terminal.js exchanges for a reader session.
 *
 * Deliberately not scoped to a location: the JS SDK discovers readers on the
 * local network (or the simulated one in test mode), and pinning the token to
 * a location would break a shop that has a reader but has not been through
 * registration yet.
 */
export async function createConnectionToken(
  shopId: string,
): Promise<{ ok: true; secret: string } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const account = await accountFor(shopId);
  const result = await stripeFetch<{ secret?: string }>(
    "/v1/terminal/connection_tokens",
    { method: "POST", account, body: {} },
  );
  if (!result.ok) return { ok: false, reason: result.message };
  if (!result.data.secret) {
    return { ok: false, reason: "Stripe did not return a connection token." };
  }
  return { ok: true, secret: result.data.secret };
}

// ---------------------------------------------------------------------------
// The payment itself
// ---------------------------------------------------------------------------

export type TerminalIntent = {
  id: string;
  clientSecret: string | null;
  amountCents: number;
};

/**
 * A card-present PaymentIntent for whatever an invoice still owes.
 *
 * `capture_method=automatic` because a repair shop takes the money now; the
 * tip-and-adjust flow that manual capture exists for belongs to restaurants.
 *
 * The amount comes from the invoice's own lines and payments, never from the
 * register — which is the same rule the POS cart follows for prices.
 */
export async function createTerminalIntent(input: {
  shopId: string;
  invoiceId: string;
}): Promise<{ ok: true; intent: TerminalIntent } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const currency = paymentsCurrency();
  if (!currencySupported(currency)) {
    return {
      ok: false,
      reason: `PAYMENTS_CURRENCY=${currency} is not a two-decimal currency; RepairFlow stores amounts in cents.`,
    };
  }

  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId, shopId: input.shopId },
    select: {
      id: true,
      status: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
    },
  });
  if (!invoice) return { ok: false, reason: "That invoice no longer exists." };
  if (invoice.status === "VOID") {
    return { ok: false, reason: "This invoice is void — it cannot take payments." };
  }

  const totals = invoiceTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
  );
  if (totals.balanceCents <= 0) {
    return { ok: false, reason: "There is nothing left to pay on this invoice." };
  }
  if (totals.balanceCents < MIN_CHARGE_CENTS) {
    return {
      ok: false,
      reason: "The balance is below the minimum a card payment can process.",
    };
  }

  const account = await accountFor(input.shopId);
  const created = await stripeFetch<StripePaymentIntent & { client_secret?: string }>(
    "/v1/payment_intents",
    {
      method: "POST",
      account,
      // Re-presenting the same card after a dropped connection must not open a
      // second intent for the same money.
      idempotencyKey: `invoice-${invoice.id}-terminal-${totals.balanceCents}`,
      body: {
        amount: totals.balanceCents,
        currency,
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: {
          invoiceId: invoice.id,
          shopId: input.shopId,
          source: "terminal",
        },
      },
    },
  );
  if (!created.ok) return { ok: false, reason: created.message };

  return {
    ok: true,
    intent: {
      id: created.data.id,
      clientSecret: created.data.client_secret ?? null,
      amountCents: totals.balanceCents,
    },
  };
}

export type TerminalSettleResult =
  | { ok: true; outcome: SettleOutcome; amountCents: number }
  | { ok: false; reason: string };

/**
 * Records a card-present payment, after checking it with Stripe.
 *
 * THE BROWSER IS NOT A WITNESS. It hands over a PaymentIntent id and nothing
 * else is believed: the intent is retrieved from Stripe, and three things have
 * to line up before a cent is written down —
 *
 *   status              must be "succeeded"
 *   metadata.invoiceId  must be the invoice the caller named
 *   metadata.shopId     must be the caller's own shop
 *
 * Without those checks a forged id would let anyone mark any invoice paid, and
 * a mistyped one would credit the wrong customer.
 *
 * The amount recorded is Stripe's, not ours: a partial authorisation is real
 * money and needs to appear as the amount that actually moved.
 */
export async function recordTerminalPayment(input: {
  shopId: string;
  invoiceId: string;
  paymentIntentId: string;
  takenById?: string | null;
}): Promise<TerminalSettleResult> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const intentId = input.paymentIntentId.trim();
  if (!intentId.startsWith("pi_")) {
    return { ok: false, reason: "That is not a Stripe payment id." };
  }

  const account = await accountFor(input.shopId);
  const result = await stripeFetch<StripePaymentIntent>(
    `/v1/payment_intents/${encodeURIComponent(intentId)}`,
    { account },
  );
  if (!result.ok) return { ok: false, reason: result.message };

  const intent = result.data;
  if (intent.status !== "succeeded") {
    return {
      ok: false,
      reason:
        intent.last_payment_error?.message ??
        `Stripe left the payment at "${intent.status}" — it was not approved.`,
    };
  }
  if (intent.metadata?.invoiceId !== input.invoiceId) {
    return { ok: false, reason: "That payment belongs to a different invoice." };
  }
  if (intent.metadata?.shopId !== input.shopId) {
    return { ok: false, reason: "That payment belongs to a different shop." };
  }

  const amountCents = Math.round(
    Number(intent.amount_received ?? intent.amount ?? 0),
  );
  if (amountCents <= 0) {
    return { ok: false, reason: "Stripe reported no money on that payment." };
  }

  const outcome = await settleStripePayment({
    shopId: input.shopId,
    invoiceId: input.invoiceId,
    amountCents,
    reference: intent.id,
    paymentIntentId: intent.id,
    chargeId: chargeIdOf(intent),
    source: "terminal",
    takenById: input.takenById ?? null,
  });

  if (outcome.status === "error") {
    return { ok: false, reason: outcome.reason };
  }
  return { ok: true, outcome, amountCents };
}

/**
 * Retrieves and validates a card-present intent WITHOUT recording anything.
 *
 * The POS uses this: at the register the invoice does not exist until the sale
 * is written, so the reader is presented first and the sale is only rung up
 * once Stripe confirms the money. The amount Stripe reports comes back with
 * it, and the caller compares that against the price it recomputes from the
 * catalogue inside its own transaction — see performCheckout.
 */
export async function verifyPosTerminalIntent(input: {
  shopId: string;
  paymentIntentId: string;
}): Promise<
  | { ok: true; intentId: string; chargeId: string | null; amountCents: number }
  | { ok: false; reason: string }
> {
  const intentId = input.paymentIntentId.trim();
  if (!intentId.startsWith("pi_")) {
    return { ok: false, reason: "That is not a Stripe payment id." };
  }

  const account = await accountFor(input.shopId);
  const result = await stripeFetch<StripePaymentIntent>(
    `/v1/payment_intents/${encodeURIComponent(intentId)}`,
    { account },
  );
  if (!result.ok) return { ok: false, reason: result.message };

  const intent = result.data;
  if (intent.status !== "succeeded") {
    return {
      ok: false,
      reason:
        intent.last_payment_error?.message ??
        `Stripe left the payment at "${intent.status}" — it was not approved.`,
    };
  }
  if (intent.metadata?.shopId !== input.shopId) {
    return { ok: false, reason: "That payment belongs to a different shop." };
  }
  const amountCents = Math.round(
    Number(intent.amount_received ?? intent.amount ?? 0),
  );
  if (amountCents <= 0) {
    return { ok: false, reason: "Stripe reported no money on that payment." };
  }

  return {
    ok: true,
    intentId: intent.id,
    chargeId: chargeIdOf(intent),
    amountCents,
  };
}

/**
 * A card-present PaymentIntent for a POS cart that has no invoice yet.
 *
 * `amountCents` MUST come from server-side pricing (see `priceCart` in
 * app/(app)/pos/checkout.ts), never from the register's own arithmetic. The
 * shop id is stamped into metadata so `verifyPosTerminalIntent` can refuse an
 * intent belonging to another tenant.
 */
export async function createPosTerminalIntent(input: {
  shopId: string;
  amountCents: number;
  /** Stable per cart, so a retry after a dropped connection is one intent. */
  cartKey: string;
}): Promise<{ ok: true; intent: TerminalIntent } | { ok: false; reason: string }> {
  if (!paymentsLive()) {
    return { ok: false, reason: "Online payments are not configured." };
  }

  const currency = paymentsCurrency();
  if (!currencySupported(currency)) {
    return {
      ok: false,
      reason: `PAYMENTS_CURRENCY=${currency} is not a two-decimal currency; RepairFlow stores amounts in cents.`,
    };
  }
  if (input.amountCents < MIN_CHARGE_CENTS) {
    return {
      ok: false,
      reason: "This sale is below the minimum a card payment can process.",
    };
  }

  const account = await accountFor(input.shopId);
  const created = await stripeFetch<StripePaymentIntent & { client_secret?: string }>(
    "/v1/payment_intents",
    {
      method: "POST",
      account,
      idempotencyKey: `pos-${input.shopId}-${input.cartKey}-${input.amountCents}`,
      body: {
        amount: input.amountCents,
        currency,
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: { shopId: input.shopId, source: "terminal", channel: "pos" },
      },
    },
  );
  if (!created.ok) return { ok: false, reason: created.message };

  return {
    ok: true,
    intent: {
      id: created.data.id,
      clientSecret: created.data.client_secret ?? null,
      amountCents: input.amountCents,
    },
  };
}
