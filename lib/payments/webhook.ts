/**
 * Stripe webhook verification and application.
 *
 * THE WEBHOOK IS THE SOURCE OF TRUTH — NOT THE REDIRECT
 * ----------------------------------------------------
 * `?paid=1` on the return URL is a hint from a browser we do not control. It
 * can be typed by hand, replayed from history, or never arrive at all because
 * the customer closed the tab the moment the receipt appeared. Money moves in
 * this file and nowhere else.
 *
 * Everything here is written for a transport that is at-least-once, unordered,
 * and occasionally hostile:
 *
 *   VERIFY   HMAC-SHA256 over `${timestamp}.${rawBody}`, compared in constant
 *            time, with a 5-minute freshness window so a captured payload
 *            cannot be replayed tomorrow.
 *   DEDUPE   The Stripe session id is stored in `Payment.reference` and the
 *            PaymentIntent id in `Payment.stripePaymentIntentId`. Either one
 *            matching means the money is already written down, which is what
 *            lets `checkout.session.completed` and `payment_intent.succeeded`
 *            both be handled without paying an invoice twice.
 *   RE-READ  The invoice's status is recomputed from its own lines and
 *            payments — never nudged by a delta — so events arriving out of
 *            order still converge on the same answer.
 *
 * The write itself lives in ./settle.ts, shared with the card-on-file and
 * Terminal paths that record a payment without waiting for a webhook.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  settleStripePayment,
  type SettleOutcome,
  type StripeSource,
} from "./settle";

/** How old a signed timestamp may be. Stripe's own default. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

export type SignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: string };

/**
 * Parses `t=1699999999,v1=abc…,v1=def…`.
 *
 * Repeated `v1` entries are normal during a webhook-secret rotation: Stripe
 * signs with both secrets, so accepting ANY matching scheme is what keeps a
 * rotation from dropping payments on the floor.
 */
function parseHeader(header: string): { t: number | null; v1: string[] } {
  let t: number | null = null;
  const v1: string[] = [];

  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) t = parsed;
    } else if (key === "v1") {
      v1.push(value);
    }
  }

  return { t, v1 };
}

/**
 * Constant-time hex comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are checked
 * first — and a length difference leaks nothing here, because a v1 signature is
 * always 64 hex characters.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function verifyStripeSignature(input: {
  /** The body EXACTLY as it arrived. Re-serialised JSON will not verify. */
  payload: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowMs?: number;
}): SignatureResult {
  if (!input.header) return { ok: false, reason: "missing signature header" };
  if (!input.secret) return { ok: false, reason: "webhook secret is not set" };

  const { t, v1 } = parseHeader(input.header);
  if (t === null) return { ok: false, reason: "malformed signature header" };
  if (v1.length === 0) return { ok: false, reason: "no v1 signature" };

  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  // Both directions: a far-future timestamp is as suspicious as a stale one.
  if (Math.abs(nowSeconds - t) > tolerance) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${t}.${input.payload}`, "utf8")
    .digest("hex");

  // Every candidate is compared even after a match, so the work done does not
  // depend on which signature was the right one.
  let matched = false;
  for (const candidate of v1) {
    if (safeEqual(candidate, expected)) matched = true;
  }
  if (!matched) return { ok: false, reason: "signature mismatch" };

  return { ok: true, timestamp: t };
}

/** Test helper — signs a payload the way Stripe does. */
export function signPayload(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}


// ---------------------------------------------------------------------------
// Applying a completed checkout
// ---------------------------------------------------------------------------

export type CheckoutSessionEvent = {
  id?: string;
  /** "payment" for an invoice, "setup" for saving a card on file. */
  mode?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_intent?: string | { id?: string } | null;
  setup_intent?: string | { id?: string } | null;
  customer?: string | { id?: string } | null;
  metadata?: {
    invoiceId?: string;
    shopId?: string;
    customerId?: string;
    source?: string;
  } | null;
};

export type ApplyOutcome = SettleOutcome;

/** Stripe sends an id string when unexpanded and an object when expanded. */
export function idOf(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

/**
 * Records a completed Checkout Session against its invoice.
 *
 * The interesting decisions — dedupe, status recompute, what to do about an
 * overpayment or a voided invoice — all live in ./settle.ts, because the
 * PaymentIntent, card-on-file and Terminal paths have to make exactly the same
 * ones. This function is the Checkout-shaped adapter onto it: unwrap the
 * session, refuse the ones that are not money, and hand over.
 *
 * `shopIdOverride` comes from a Connect event's `account` field, resolved
 * against `Shop.stripeAccountId`. It is the more trustworthy of the two — an
 * account id we stored ourselves beats metadata that rode in on the event — so
 * it wins when both are present.
 */
export async function applyCheckoutSession(
  session: CheckoutSessionEvent,
  shopIdOverride?: string | null,
): Promise<ApplyOutcome> {
  const sessionId = session.id?.trim();
  if (!sessionId) return { status: "ignored", reason: "session has no id" };

  // "complete" can also mean "the bank debit is pending". Only paid is paid.
  const paymentStatus = session.payment_status ?? "";
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return {
      status: "ignored",
      reason: `payment_status=${paymentStatus || "unknown"}`,
    };
  }

  const invoiceId = session.metadata?.invoiceId?.trim();
  const shopId = shopIdOverride?.trim() || session.metadata?.shopId?.trim();
  if (!invoiceId || !shopId) {
    return { status: "ignored", reason: "session is not one of ours" };
  }

  return settleStripePayment({
    shopId,
    invoiceId,
    amountCents: Math.round(Number(session.amount_total ?? 0)),
    // The session id stays the reference: it is the handle staff will be
    // reading back to Stripe support, and it is what pre-Wave-8 rows carry.
    reference: sessionId,
    paymentIntentId: idOf(session.payment_intent),
    chargeId: null,
    source: "checkout",
  });
}

// ---------------------------------------------------------------------------
// Applying a succeeded PaymentIntent
// ---------------------------------------------------------------------------

export type PaymentIntentEvent = {
  id?: string;
  status?: string | null;
  amount?: number | null;
  amount_received?: number | null;
  latest_charge?: string | { id?: string } | null;
  metadata?: {
    invoiceId?: string;
    shopId?: string;
    source?: string;
  } | null;
};

/** The sources this app stamps onto its own PaymentIntents. */
function sourceOf(raw: string | undefined): StripeSource {
  if (raw === "terminal" || raw === "card_on_file") return raw;
  return "checkout";
}

/**
 * Records a succeeded PaymentIntent — the card reader and the card on file.
 *
 * BOTH OF THOSE ALSO RECORD SYNCHRONOUSLY. A card-present sale writes the
 * payment the moment the reader approves, because the cashier is standing
 * there and cannot wait on a webhook; charging a card on file does the same.
 * This handler exists for the case where those calls did not get to finish —
 * the tab was closed, the process restarted, the network died between Stripe
 * approving and this app writing the row. The dedupe in ./settle.ts means the
 * ordinary case (both paths run) still produces exactly one Payment.
 *
 * Checkout PaymentIntents land here too. They dedupe against the session's row
 * on `stripePaymentIntentId`, which is precisely why that column is written.
 */
export async function applyPaymentIntent(
  intent: PaymentIntentEvent,
  shopIdOverride?: string | null,
): Promise<ApplyOutcome> {
  const intentId = intent.id?.trim();
  if (!intentId) return { status: "ignored", reason: "intent has no id" };

  if ((intent.status ?? "") !== "succeeded") {
    return { status: "ignored", reason: `status=${intent.status ?? "unknown"}` };
  }

  const invoiceId = intent.metadata?.invoiceId?.trim();
  const shopId = shopIdOverride?.trim() || intent.metadata?.shopId?.trim();
  if (!invoiceId || !shopId) {
    return { status: "ignored", reason: "intent is not one of ours" };
  }

  return settleStripePayment({
    shopId,
    invoiceId,
    amountCents: Math.round(
      Number(intent.amount_received ?? intent.amount ?? 0),
    ),
    reference: intentId,
    paymentIntentId: intentId,
    chargeId: idOf(intent.latest_charge),
    source: sourceOf(intent.metadata?.source),
  });
}
