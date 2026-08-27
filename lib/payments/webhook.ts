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
 *   DEDUPE   The Stripe session id is stored in `Payment.reference`. A second
 *            delivery of the same event finds that row and does nothing.
 *   RE-READ  The invoice's status is recomputed from its own lines and
 *            payments — never nudged by a delta — so events arriving out of
 *            order still converge on the same answer.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";

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
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_intent?: string | null;
  metadata?: { invoiceId?: string; shopId?: string } | null;
};

export type ApplyOutcome =
  /** A payment row was written and the invoice status recomputed. */
  | { status: "recorded"; paymentId: string; invoiceStatus: string }
  /** Already applied, or nothing to apply. Safe, expected, and a 200. */
  | { status: "ignored"; reason: string }
  /** The write failed. The caller should ask Stripe to redeliver. */
  | { status: "error"; reason: string };

/**
 * Records a completed Checkout Session against its invoice.
 *
 * STATUS RECOMPUTE — mirrors takePaymentAction in app/(app)/invoices/actions.ts:
 *   balance after this payment <= 0  →  PAID,    paidAt = now
 *   balance after this payment  > 0  →  PARTIAL, paidAt = null
 *
 * ONE DELIBERATE DIFFERENCE from the counter flow: the staff form refuses an
 * amount larger than the balance, because nobody has been charged yet and the
 * cashier can simply retype it. Here the card has already been debited. An
 * overpayment (a second tab, a stale session opened before a cash payment was
 * keyed in) is money the shop is holding, and it gets recorded in full. Money
 * that arrived and was not written down is the one outcome with no recovery.
 */
export async function applyCheckoutSession(
  session: CheckoutSessionEvent,
): Promise<ApplyOutcome> {
  const sessionId = session.id?.trim();
  if (!sessionId) return { status: "ignored", reason: "session has no id" };

  // "complete" can also mean "the bank debit is pending". Only paid is paid.
  const paymentStatus = session.payment_status ?? "";
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return { status: "ignored", reason: `payment_status=${paymentStatus || "unknown"}` };
  }

  const amountCents = Math.round(Number(session.amount_total ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "ignored", reason: "no amount on session" };
  }

  const invoiceId = session.metadata?.invoiceId?.trim();
  const shopId = session.metadata?.shopId?.trim();
  if (!invoiceId || !shopId) {
    return { status: "ignored", reason: "session is not one of ours" };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        // Scoped by BOTH ids. Metadata rides on an event we authenticated, but
        // it is still an id that arrived over the wire: a mismatched pair finds
        // nothing and writes nothing.
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, shopId },
          select: {
            id: true,
            status: true,
            taxRateBps: true,
            lines: {
              select: { quantity: true, unitPriceCents: true, taxable: true },
            },
            payments: { select: { amountCents: true } },
          },
        });
        if (!invoice) {
          return { status: "ignored" as const, reason: "invoice not found for that shop" };
        }

        // Re-check inside the transaction, not before it: two simultaneous
        // deliveries of the same event both pass an outside check.
        const existing = await tx.payment.findFirst({
          where: { invoiceId: invoice.id, reference: sessionId },
          select: { id: true },
        });
        if (existing) {
          return { status: "ignored" as const, reason: "already recorded" };
        }

        if (invoice.status === "VOID") {
          // Voided after the customer opened checkout. The money is real and
          // needs refunding by hand; silently marking a void invoice paid would
          // hide that from whoever has to do it.
          console.error(
            `[payments] session ${sessionId} paid ${amountCents} against VOID invoice ${invoice.id} — refund required`,
          );
          return { status: "ignored" as const, reason: "invoice is void" };
        }

        const totals = invoiceTotals(
          invoice.lines,
          invoice.taxRateBps,
          invoice.payments,
        );
        const balanceAfter = totals.balanceCents - amountCents;
        const nextStatus = balanceAfter <= 0 ? "PAID" : "PARTIAL";

        const payment = await tx.payment.create({
          data: {
            shopId,
            invoiceId: invoice.id,
            amountCents,
            method: "CARD",
            // The session id is both the audit trail back to Stripe and the
            // dedupe key that makes this handler safe to run twice.
            reference: sessionId,
            // Nobody stood at a counter for this one.
            takenById: null,
          },
          select: { id: true },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: nextStatus,
            paidAt: balanceAfter <= 0 ? new Date() : null,
          },
        });

        return {
          status: "recorded" as const,
          paymentId: payment.id,
          invoiceStatus: nextStatus,
        };
      },
      // Serializable turns the read-then-write above into a real guarantee:
      // concurrent duplicate deliveries cannot both pass the dedupe check, one
      // of them aborts, and the caller asks Stripe to redeliver.
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("[payments] failed to apply checkout session:", error);
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "write failed",
    };
  }
}
