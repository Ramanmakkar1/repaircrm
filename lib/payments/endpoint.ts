/**
 * The step the shop owner is never asked to do.
 *
 * WHAT STRIPE CALLS A WEBHOOK, THIS APP CALLS A PAYMENT CONFIRMATION
 * -----------------------------------------------------------------
 * When a card is charged, Stripe posts a signed message back to this app and
 * that message — not the customer's browser — is what marks the invoice paid.
 * Until Wave 9 somebody had to open the Stripe dashboard, create that endpoint
 * by hand, copy a signing secret and paste it into an environment variable on
 * the server. That is one dashboard, two screens and a secret too many for a
 * repair shop, and it was the exact step the owner objected to.
 *
 * So it is created here, over the API, the moment a shop finishes connecting:
 * `POST /v1/webhook_endpoints` on the shop's OWN account (the `Stripe-Account`
 * header), subscribed to precisely the events app/api/webhooks/stripe/route.ts
 * knows how to handle and nothing else. Stripe returns the endpoint id and a
 * signing secret; both are stored on the Shop row and the secret never leaves
 * this server.
 *
 * IDEMPOTENT BY LISTING FIRST
 * ---------------------------
 * Reconnecting must not leave a shop with five endpoints all posting the same
 * event. Every run lists what is already on the account, keeps the one whose
 * URL matches ours AND whose secret we still hold, and deletes the rest of the
 * ones this app created. An endpoint at our URL whose secret we do NOT hold is
 * useless — Stripe reveals a signing secret only in the create response — so it
 * is deleted and replaced rather than kept as decoration.
 *
 * A FAILURE HERE IS NOT A FAILED CONNECTION
 * -----------------------------------------
 * Some platforms cannot create endpoints on a connected account. That must not
 * turn a successful Connect into an error page: the reason is written to
 * `Shop.stripeWebhookError`, the Payments tab shows one line and a Retry
 * button, and card payments still work — they just settle when the app is next
 * reachable.
 */

import { appUrl } from "@/lib/comms/config";
import { db } from "@/lib/db";

import { stripeFetch } from "./stripe";

/**
 * Exactly what app/api/webhooks/stripe/route.ts acts on.
 *
 * Subscribing to `*` would work and would also mean this app is woken up for
 * every payout, every dispute and every account update Stripe invents next
 * year — each one a delivery that gets retried for three days when the app is
 * down. The list is short because the handler is short.
 */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
  "charge.refunded",
  "refund.updated",
  "account.application.deauthorized",
] as const;

/** The event type the health check sends itself. Never sent by Stripe. */
export const PING_EVENT_TYPE = "repairflow.setup.check";

/** Marks the endpoints this app created, so cleanup never touches a stranger's. */
const OWNER_TAG = "repairflow";

/** Where Stripe is told to post. Derived from the app's own address. */
export function webhookEndpointUrl(): string {
  return `${appUrl()}/api/webhooks/stripe`;
}

// ---------------------------------------------------------------------------
// Is this app reachable from the internet at all?
// ---------------------------------------------------------------------------

/** Hostnames Stripe's servers can never resolve to this machine. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  // A bare hostname with no dot is a LAN name, not something with a DNS record.
  if (!host.includes(".") && host !== "") return true;
  return false;
}

export type AddressCheck = {
  url: string;
  /** False when Stripe could not reach this app even if it wanted to. */
  publicAddress: boolean;
  /** One sentence, already written for a shop owner. */
  message: string;
};

/**
 * Whether `NEXT_PUBLIC_APP_URL` is somewhere Stripe can post to.
 *
 * Creating an endpoint pointing at `http://localhost:3010` is worse than
 * creating none: Stripe accepts it, retries it for three days, and eventually
 * disables it — and the owner sees a green tick the whole time. So a private
 * address stops the automatic setup and says so plainly instead.
 */
export function checkAppAddress(): AddressCheck {
  const url = webhookEndpointUrl();
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return {
      url,
      publicAddress: false,
      message:
        "NEXT_PUBLIC_APP_URL is not a valid web address, so Stripe has nowhere to send payment confirmations.",
    };
  }

  if (isPrivateHost(hostname)) {
    return {
      url,
      publicAddress: false,
      message:
        "Your app is running on localhost, so Stripe can't reach it — card payments will still work, but they'll settle when you're back on a public address.",
    };
  }

  return {
    url,
    publicAddress: true,
    message: "Stripe can reach this app to confirm payments.",
  };
}

// ---------------------------------------------------------------------------
// Stripe's webhook_endpoint object, narrowed to what is read here
// ---------------------------------------------------------------------------

type StripeWebhookEndpoint = {
  id: string;
  url?: string;
  status?: string;
  enabled_events?: string[];
  /** Present ONLY in the create response. This is the whole reason for the dance. */
  secret?: string;
  metadata?: Record<string, string> | null;
};

// ---------------------------------------------------------------------------
// Creating / repairing the endpoint
// ---------------------------------------------------------------------------

export type WebhookSetupResult =
  | { status: "ready"; endpointId: string; reused: boolean }
  | { status: "direct-mode" }
  | { status: "not-public"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Makes sure this shop's connected account posts its payments back to us.
 *
 * Called right after Connect finishes and from the Retry button. Safe to run
 * as often as you like: the listing pass means the second run reuses whatever
 * the first one made.
 *
 * Never throws and never fails a connection — the caller records the result
 * and carries on.
 */
export async function ensureShopWebhook(
  shopId: string,
): Promise<WebhookSetupResult> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      stripeAccountId: true,
      stripeWebhookId: true,
      stripeWebhookSecret: true,
    },
  });

  const account = shop?.stripeAccountId ?? null;
  // Direct mode: the platform's own endpoint and `STRIPE_WEBHOOK_SECRET` are
  // what serve this shop, and neither is ours to create per tenant.
  if (!account) return { status: "direct-mode" };

  const address = checkAppAddress();
  if (!address.publicAddress) {
    await db.shop.updateMany({
      where: { id: shopId },
      data: { stripeWebhookError: address.message },
    });
    return { status: "not-public", reason: address.message };
  }

  const listed = await stripeFetch<{ data?: StripeWebhookEndpoint[] }>(
    "/v1/webhook_endpoints",
    { account, query: { limit: 100 } },
  );
  if (!listed.ok) return fail(shopId, listed.message);

  const existing = listed.data.data ?? [];
  const ours = existing.filter(
    (endpoint) => endpoint.metadata?.[OWNER_TAG] === shopId,
  );

  // The one we can still prove we own: right URL, right id, secret in hand.
  const keepable = ours.find(
    (endpoint) =>
      endpoint.url === address.url &&
      endpoint.id === shop?.stripeWebhookId &&
      Boolean(shop?.stripeWebhookSecret),
  );

  // Everything else this app made is stale — a previous address, a duplicate
  // from a reconnect, or an endpoint whose secret was lost with the database.
  for (const endpoint of ours) {
    if (endpoint.id === keepable?.id) continue;
    await stripeFetch(`/v1/webhook_endpoints/${encodeURIComponent(endpoint.id)}`, {
      method: "DELETE",
      account,
    });
  }

  if (keepable) {
    // Re-state the event list rather than assume it: this app's handler grows,
    // and an endpoint subscribed to last year's list silently drops refunds.
    const updated = await stripeFetch<StripeWebhookEndpoint>(
      `/v1/webhook_endpoints/${encodeURIComponent(keepable.id)}`,
      {
        method: "POST",
        account,
        body: {
          enabled_events: [...WEBHOOK_EVENTS],
          disabled: false,
          description: "RepairFlow payment confirmations",
        },
      },
    );
    if (!updated.ok) return fail(shopId, updated.message);

    await db.shop.updateMany({
      where: { id: shopId },
      data: {
        stripeWebhookUrl: address.url,
        stripeWebhookAt: new Date(),
        stripeWebhookError: null,
      },
    });
    return { status: "ready", endpointId: keepable.id, reused: true };
  }

  const created = await stripeFetch<StripeWebhookEndpoint>(
    "/v1/webhook_endpoints",
    {
      method: "POST",
      account,
      body: {
        url: address.url,
        enabled_events: [...WEBHOOK_EVENTS],
        description: "RepairFlow payment confirmations",
        metadata: { [OWNER_TAG]: shopId },
      },
    },
  );
  if (!created.ok) return fail(shopId, created.message);
  if (!created.data.secret) {
    return fail(
      shopId,
      "Stripe created the connection but did not return a signing secret.",
    );
  }

  await db.shop.updateMany({
    where: { id: shopId },
    data: {
      stripeWebhookId: created.data.id,
      // Server-only from here on. No query in the app selects this column into
      // anything that reaches a browser — see `webhookSetupStatus` below.
      stripeWebhookSecret: created.data.secret,
      stripeWebhookUrl: address.url,
      stripeWebhookAt: new Date(),
      stripeWebhookError: null,
    },
  });

  return { status: "ready", endpointId: created.data.id, reused: false };
}

/**
 * Records why setup did not finish, in the sentence the tab will show.
 *
 * Stripe's own message is kept — it is the only thing that will help anyone
 * work out what happened — but it is quoted rather than presented as ours, and
 * it comes AFTER a sentence written for a shop owner. "You do not have
 * permission to create webhook endpoints on connected accounts" is a true and
 * completely unusable opening line.
 */
async function fail(shopId: string, reason: string): Promise<WebhookSetupResult> {
  const message = `RepairFlow couldn't finish setting this up with Stripe. Stripe said: ${reason}`;
  await db.shop.updateMany({
    where: { id: shopId },
    data: { stripeWebhookError: message },
  });
  console.error(`[payments] webhook setup for shop ${shopId} failed: ${reason}`);
  return { status: "failed", reason: message };
}

/**
 * Removes the endpoint when a shop disconnects.
 *
 * Left behind, it would keep posting a disconnected shop's events at this app
 * forever — and after the account id is cleared the route cannot even tell
 * whose they are. The local columns are cleared either way: a stored signing
 * secret for an account we no longer serve is a credential with no purpose.
 */
export async function deleteShopWebhook(shopId: string): Promise<void> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { stripeAccountId: true, stripeWebhookId: true },
  });

  if (shop?.stripeAccountId && shop.stripeWebhookId) {
    const removed = await stripeFetch(
      `/v1/webhook_endpoints/${encodeURIComponent(shop.stripeWebhookId)}`,
      { method: "DELETE", account: shop.stripeAccountId },
    );
    if (!removed.ok) {
      console.warn(
        `[payments] could not delete webhook endpoint ${shop.stripeWebhookId}: ${removed.message}`,
      );
    }
  }

  await clearShopWebhook(shopId);
}

/** Forgets the endpoint locally. Used by both disconnect paths. */
export async function clearShopWebhook(shopId: string): Promise<void> {
  await db.shop.updateMany({
    where: { id: shopId },
    data: {
      stripeWebhookId: null,
      stripeWebhookSecret: null,
      stripeWebhookUrl: null,
      stripeWebhookAt: null,
      stripeWebhookError: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

/**
 * The signing secret for a connected account, or null.
 *
 * The ONLY caller is the webhook route, which needs it to check a signature.
 * Keyed by account id because that is all an inbound event carries — and the
 * lookup itself is the tenant check: an account this app never stored finds
 * nothing and the event is refused.
 */
export async function webhookSecretForAccount(
  accountId: string,
): Promise<{ shopId: string; secret: string } | null> {
  const shop = await db.shop.findFirst({
    where: { stripeAccountId: accountId },
    select: { id: true, stripeWebhookSecret: true },
  });
  if (!shop?.stripeWebhookSecret) return null;
  return { shopId: shop.id, secret: shop.stripeWebhookSecret };
}

/** The shop's own signing secret, for the health check's self-addressed ping. */
export async function webhookSecretForShop(
  shopId: string,
): Promise<string | null> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { stripeWebhookSecret: true },
  });
  return shop?.stripeWebhookSecret ?? null;
}

export type WebhookSetupStatus = {
  /** True when this shop has its own endpoint and its secret. */
  automatic: boolean;
  endpointId: string | null;
  /** The address Stripe was given, which may differ from today's app address. */
  url: string | null;
  setUpAt: string | null;
  /** Non-null when the last automatic attempt did not finish. */
  error: string | null;
  /** True when the app has moved since the endpoint was created. */
  addressChanged: boolean;
};

/**
 * What the Payments tab is allowed to know.
 *
 * Deliberately built by hand rather than by spreading the Shop row: the secret
 * column sits right next to these fields, and a `select: true` refactor one
 * afternoon would put a signing key into a page payload. Naming each field is
 * the guard.
 */
export async function webhookSetupStatus(
  shopId: string,
): Promise<WebhookSetupStatus> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      stripeWebhookId: true,
      stripeWebhookSecret: true,
      stripeWebhookUrl: true,
      stripeWebhookAt: true,
      stripeWebhookError: true,
    },
  });

  const url = shop?.stripeWebhookUrl ?? null;
  return {
    automatic: Boolean(shop?.stripeWebhookId && shop?.stripeWebhookSecret),
    endpointId: shop?.stripeWebhookId ?? null,
    url,
    setUpAt: shop?.stripeWebhookAt?.toISOString() ?? null,
    error: shop?.stripeWebhookError ?? null,
    addressChanged: Boolean(url) && url !== webhookEndpointUrl(),
  };
}

/** Whether the endpoint this app made is still on the account, and enabled. */
export async function readRemoteEndpoint(input: {
  accountId: string;
  endpointId: string;
}): Promise<
  | { ok: true; url: string | null; enabled: boolean; events: string[] }
  | { ok: false; reason: string }
> {
  const result = await stripeFetch<StripeWebhookEndpoint>(
    `/v1/webhook_endpoints/${encodeURIComponent(input.endpointId)}`,
    { account: input.accountId },
  );
  if (!result.ok) return { ok: false, reason: result.message };
  return {
    ok: true,
    url: result.data.url ?? null,
    enabled: (result.data.status ?? "enabled") === "enabled",
    events: result.data.enabled_events ?? [],
  };
}
