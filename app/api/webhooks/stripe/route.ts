import {
  applyChargeRefunded,
  applyCheckoutSession,
  applyPaymentIntent,
  applyRefundEvent,
  clearConnectionByAccount,
  idOf,
  storeCardFromSetupIntent,
  stripeWebhookSecret,
  verifyStripeSignature,
  webhookSecretForAccount,
  PING_EVENT_TYPE,
  type ApplyOutcome,
  type CheckoutSessionEvent,
  type PaymentIntentEvent,
} from "@/lib/payments";
import type { StripeCharge, StripeRefundObject } from "@/lib/payments/stripe";
import { db } from "@/lib/db";

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
 * CONNECT EVENTS
 * --------------
 * An event about a connected account carries `account: "acct_…"` at the top
 * level. That id is resolved against `Shop.stripeAccountId` and the shop it
 * finds WINS over any `shopId` in the payload's metadata — an account id this
 * app stored itself is a stronger claim than metadata riding in on the event.
 * Platform (direct-mode) events have no `account` and fall back to metadata,
 * exactly as before.
 *
 * WHICH SECRET VERIFIES IT
 * ------------------------
 * Since Wave 9 each connected shop has its OWN endpoint, created for it
 * automatically (lib/payments/endpoint.ts), with its own signing secret stored
 * on the Shop row. So the body is parsed ONCE, before verification, for the
 * single purpose of reading `account` and choosing which secret to try — a
 * parse is not trust, and nothing from that object is used for anything else
 * until a signature has verified over the raw bytes.
 *
 * The env `STRIPE_WEBHOOK_SECRET` stays in the candidate list behind it. That
 * is what serves direct-mode shops, and it is also the rotation tolerance: an
 * event signed with either the shop's secret or the server's is accepted, so
 * re-running setup mid-day does not drop the payments already in flight.
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

type StripeEvent = {
  id?: string;
  type?: string;
  /** Present on Connect events: the connected account the event belongs to. */
  account?: string;
  data?: { object?: Record<string, unknown> };
};

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  // The shop this event belongs to, and the secret Stripe would have signed it
  // with. Both come from OUR database, keyed by the account id on the event —
  // an account this app never stored resolves to nothing and is refused below.
  const connected = event.account
    ? await webhookSecretForAccount(event.account)
    : null;

  const candidates: string[] = [];
  if (connected) candidates.push(connected.secret);
  const envSecret = stripeWebhookSecret();
  if (envSecret) candidates.push(envSecret);

  if (candidates.length === 0) {
    // Nothing to check a signature against. Refuse loudly rather than accept an
    // unsigned payload — an endpoint that trusts anything is worse than one
    // that is down.
    console.error(
      event.account
        ? `[payments] no signing secret stored for account ${event.account}; rejecting webhook`
        : "[payments] STRIPE_WEBHOOK_SECRET is not set; rejecting webhook",
    );
    return new Response("webhook not configured", { status: 400 });
  }

  const header = request.headers.get("stripe-signature");
  let reason = "signature mismatch";
  const verified = candidates.some((secret) => {
    const result = verifyStripeSignature({ payload: rawBody, header, secret });
    if (!result.ok) reason = result.reason;
    return result.ok;
  });
  if (!verified) {
    console.warn(`[payments] rejected webhook: ${reason}`);
    return new Response(`invalid signature: ${reason}`, { status: 400 });
  }

  const type = event.type ?? "";
  const object = event.data?.object ?? {};
  // Resolved once, up front: every handler below needs the same answer, and a
  // Connect event that names an account we do not know must not fall through
  // to trusting the metadata instead.
  const shopId = connected?.shopId ?? (await resolveShopId(event.account));
  if (event.account && !shopId) {
    return Response.json({ received: true, ignored: "unknown connected account" });
  }

  switch (type) {
    case PING_EVENT_TYPE: {
      // Not from Stripe: the "Test payments" check posts this to the app's own
      // public address to prove the round trip works end to end. Reaching this
      // line already means the signature verified against the stored secret,
      // which is the whole point — and the nonce is echoed so the checker can
      // be sure the 200 came from THIS message, not from a cached response or
      // whatever else happens to answer on that address.
      const nonce = (object as { nonce?: unknown }).nonce;
      return Response.json({
        received: true,
        outcome: "setup_check",
        nonce: typeof nonce === "string" ? nonce : null,
      });
    }

    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = object as CheckoutSessionEvent;
      // Saving a card and paying an invoice arrive as the same event type and
      // are told apart only by `mode`.
      if (session.mode === "setup") {
        return handleSetupSession(session, shopId, event.id);
      }
      return respond(await applyCheckoutSession(session, shopId), event.id);
    }

    case "payment_intent.succeeded":
      return respond(
        await applyPaymentIntent(object as PaymentIntentEvent, shopId),
        event.id,
      );

    case "charge.refunded": {
      const outcomes = await applyChargeRefunded(object as StripeCharge, shopId);
      return Response.json({
        received: true,
        refunds: outcomes.map((outcome) => outcome.status),
      });
    }

    case "refund.updated": {
      const outcome = await applyRefundEvent(object as StripeRefundObject, shopId);
      return Response.json({ received: true, outcome: outcome.status });
    }

    case "account.application.deauthorized": {
      // The owner revoked us from Stripe's side. Holding on to the account id
      // would make every later charge fail with a permissions error nobody in
      // the shop can interpret.
      if (!event.account) {
        return Response.json({ received: true, ignored: "no account on event" });
      }
      const cleared = await clearConnectionByAccount(event.account);
      console.log(
        `[payments] account ${event.account} deauthorized; cleared ${cleared} shop connection(s)`,
      );
      return Response.json({ received: true, cleared });
    }

    default:
      // Everything else: acknowledged and dropped.
      return Response.json({ received: true, ignored: type || "unknown" });
  }
}

/**
 * The shop that owns a connected account, or null.
 *
 * A single indexed lookup by `stripeAccountId`. Returning null for an account
 * we have never seen is deliberate: a disconnected shop still receives events
 * for a while, and applying them to whatever the metadata claimed would write
 * money into a tenant that no longer owns the account.
 */
async function resolveShopId(account: string | undefined): Promise<string | null> {
  if (!account) return null;
  const shop = await db.shop.findFirst({
    where: { stripeAccountId: account },
    select: { id: true },
  });
  return shop?.id ?? null;
}

/**
 * `mode=setup` — the customer just saved a card.
 *
 * The SetupIntent is re-read from Stripe rather than trusted from the payload,
 * and the customer is written scoped by shopId. Nothing about money happens
 * here, so a failure is a 500 and a redelivery rather than anything louder.
 */
async function handleSetupSession(
  session: CheckoutSessionEvent,
  shopIdOverride: string | null,
  eventId: string | undefined,
): Promise<Response> {
  const shopId = shopIdOverride ?? session.metadata?.shopId?.trim() ?? "";
  const customerId = session.metadata?.customerId?.trim() ?? "";
  const setupIntentId = idOf(session.setup_intent);

  if (!shopId || !customerId || !setupIntentId) {
    return Response.json({ received: true, ignored: "setup is not one of ours" });
  }

  const result = await storeCardFromSetupIntent({
    shopId,
    customerId,
    setupIntentId,
  });
  if (!result.ok) {
    console.error(`[payments] event ${eventId ?? "?"} card save failed: ${result.reason}`);
    return new Response(`could not save card: ${result.reason}`, { status: 500 });
  }

  console.log(
    `[payments] event ${eventId ?? "?"} saved ${result.card.brand} ····${result.card.last4} for customer ${customerId}`,
  );
  return Response.json({ received: true, outcome: "card_saved" });
}

/** Turns a settlement outcome into the status code Stripe should act on. */
function respond(outcome: ApplyOutcome, eventId: string | undefined): Response {
  if (outcome.status === "error") {
    // Stripe's retry schedule is the recovery mechanism for a database blip.
    return new Response(`could not record payment: ${outcome.reason}`, {
      status: 500,
    });
  }

  if (outcome.status === "recorded") {
    console.log(
      `[payments] event ${eventId ?? "?"} recorded payment ${outcome.paymentId}; invoice now ${outcome.invoiceStatus}`,
    );
  }

  return Response.json({ received: true, outcome: outcome.status });
}
