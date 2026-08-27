import { applyCheckoutSession, stripeWebhookSecret, verifyStripeSignature } from "@/lib/payments";
import type { CheckoutSessionEvent } from "@/lib/payments";

/**
 * POST /api/webhooks/stripe
 *
 * The only endpoint in the app that can mark an invoice paid from a card.
 *
 * UNAUTHENTICATED BY DESIGN, AUTHENTICATED BY SIGNATURE
 * ----------------------------------------------------
 * There is no session and no API key here — Stripe has neither. The HMAC over
 * the raw body IS the authentication, so the body is read with `request.text()`
 * BEFORE anything parses it. `await request.json()` would hand back an object
 * that re-serialises with different whitespace and key order, and the signature
 * would never verify again.
 *
 * STATUS CODES ARE INSTRUCTIONS TO STRIPE, NOT DESCRIPTIONS OF OUR MOOD
 *   400  the signature did not verify — do not retry, it will never verify
 *   500  we could not write it down — please redeliver
 *   200  handled, already handled, or none of our business
 *
 * Anything unrecognised is a 200. Answering 4xx to an event type we simply do
 * not care about teaches Stripe to retry it for days and eventually disables
 * the endpoint that our actual payments depend on.
 */

/** Events that mean "the money is ours now". */
const PAID_EVENTS = new Set([
  "checkout.session.completed",
  // Delayed methods (bank debits) confirm on their own schedule; the session
  // completed hours ago with payment_status "unpaid".
  "checkout.session.async_payment_succeeded",
]);

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: CheckoutSessionEvent };
};

export async function POST(request: Request): Promise<Response> {
  const secret = stripeWebhookSecret();
  if (!secret) {
    // Not configured. Refuse loudly rather than accepting unsigned payloads —
    // an endpoint that trusts anything is worse than an endpoint that is down.
    console.error("[payments] STRIPE_WEBHOOK_SECRET is not set; rejecting webhook");
    return new Response("webhook not configured", { status: 400 });
  }

  const rawBody = await request.text();

  const signature = verifyStripeSignature({
    payload: rawBody,
    header: request.headers.get("stripe-signature"),
    secret,
  });
  if (!signature.ok) {
    console.warn(`[payments] rejected webhook: ${signature.reason}`);
    return new Response(`invalid signature: ${signature.reason}`, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const type = event.type ?? "";
  if (!PAID_EVENTS.has(type)) {
    // payment_intent.*, charge.*, everything else: acknowledged and dropped.
    return Response.json({ received: true, ignored: type || "unknown" });
  }

  const outcome = await applyCheckoutSession(event.data?.object ?? {});

  if (outcome.status === "error") {
    // Stripe's retry schedule is the recovery mechanism for a database blip.
    return new Response(`could not record payment: ${outcome.reason}`, {
      status: 500,
    });
  }

  if (outcome.status === "recorded") {
    console.log(
      `[payments] event ${event.id ?? "?"} recorded payment ${outcome.paymentId}; invoice now ${outcome.invoiceStatus}`,
    );
  }

  return Response.json({ received: true, outcome: outcome.status });
}
