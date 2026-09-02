/**
 * Stripe Connect — one-click onboarding for a shop.
 *
 * WHY THE OWNER NEVER PASTES AN API KEY
 * ------------------------------------
 * A shop owner who is handed a text box labelled "Stripe secret key" will do
 * one of three things: paste the wrong one, paste it into a support chat, or
 * give up. Connect's OAuth flow replaces all of that with a button: Stripe
 * authenticates them, Stripe asks the permission question, and what comes back
 * is an ACCOUNT ID, not a credential. There is no secret to store, leak or
 * rotate on the shop's behalf — every later call is made with the PLATFORM key
 * plus a `Stripe-Account` header naming the shop.
 *
 * DIRECT MODE STILL WORKS
 * -----------------------
 * A shop with no `stripeAccountId` is not broken; it is a shop whose payments
 * run on the platform's own account, which is exactly how every shop worked
 * before this file existed. `accountFor()` returns null for them and
 * `stripeFetch` then sends no `Stripe-Account` header at all.
 *
 * THE `state` PARAMETER IS A SIGNED TICKET, NOT A HINT
 * ---------------------------------------------------
 * The callback is an unauthenticated GET that arrives from Stripe's domain. If
 * it trusted a `shopId` in the query string, anyone could attach their own
 * Stripe account to someone else's shop — or worse, attach a shop's account to
 * their own tenant and start collecting its money. So `state` is an HMAC over
 * `{shopId, nonce, issuedAt}` keyed with AUTH_SECRET, it expires in fifteen
 * minutes, and a callback whose state does not verify is dropped.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { appUrl } from "@/lib/comms/config";
import { db } from "@/lib/db";

import { paymentsCurrency, stripeSecretKey } from "./config";
import {
  stripeClientId,
  stripeConnectBase,
  stripeFetch,
  stripeTestMode,
} from "./stripe";

/** How long a half-finished authorize round trip stays valid. */
export const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * Can this SERVER offer Connect at all?
 *
 * Both halves are platform-level env and neither is a shop's problem: without
 * the secret key nothing can be charged, and without the client id there is no
 * OAuth application to send the owner to.
 */
export function connectConfigured(): boolean {
  return Boolean(stripeSecretKey()) && Boolean(stripeClientId());
}

// ---------------------------------------------------------------------------
// state signing
// ---------------------------------------------------------------------------

function stateSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is not set — Stripe Connect cannot sign its state.");
  }
  return secret;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** `<base64url payload>.<hex hmac>` — compact enough for a query string. */
export function signConnectState(shopId: string, nowMs = Date.now()): string {
  const payload = b64url(
    JSON.stringify({ shopId, nonce: randomUUID(), iat: nowMs }),
  );
  const mac = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

/**
 * Returns the shopId the state was minted for, or null.
 *
 * Constant-time comparison, and the payload is only parsed AFTER the signature
 * verifies — an attacker-controlled JSON blob is not something to hand to a
 * parser on the strength of hope.
 */
export function verifyConnectState(
  state: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = state.slice(0, dot);
  const presented = state.slice(dot + 1);
  const expected = createHmac("sha256", stateSecret())
    .update(payload)
    .digest("hex");

  if (presented.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { shopId?: unknown; iat?: unknown };
    if (typeof decoded.shopId !== "string" || !decoded.shopId) return null;
    if (typeof decoded.iat !== "number") return null;
    if (nowMs - decoded.iat > STATE_TTL_MS) return null;
    if (decoded.iat - nowMs > 60_000) return null; // clock skew, not the future
    return decoded.shopId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The authorize URL
// ---------------------------------------------------------------------------

export function connectRedirectUri(): string {
  return `${appUrl()}/api/payments/stripe/callback`;
}

/**
 * Where the "Connect with Stripe" button sends the owner.
 *
 * `scope=read_write` is what lets the platform create charges on the account.
 * `stripe_user[email]` is a courtesy prefill; Stripe ignores it for an owner
 * who is already signed in.
 */
export function connectAuthorizeUrl(input: {
  shopId: string;
  shopName?: string | null;
  email?: string | null;
  nowMs?: number;
}): string {
  const clientId = stripeClientId();
  if (!clientId) throw new Error("STRIPE_CLIENT_ID is not set.");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: connectRedirectUri(),
    state: signConnectState(input.shopId, input.nowMs),
  });
  if (input.email) params.set("stripe_user[email]", input.email);
  if (input.shopName) params.set("stripe_user[business_name]", input.shopName);

  return `${stripeConnectBase()}/oauth/authorize?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange / revocation
// ---------------------------------------------------------------------------

type OAuthTokenResponse = {
  stripe_user_id?: string;
  livemode?: boolean;
  scope?: string;
};

export type ConnectExchange =
  | { ok: true; accountId: string; livemode: boolean }
  | { ok: false; reason: string };

/** Swaps the one-time `code` for the shop's account id. */
export async function exchangeConnectCode(
  code: string,
): Promise<ConnectExchange> {
  const result = await stripeFetch<OAuthTokenResponse>("/oauth/token", {
    connect: true,
    method: "POST",
    body: { grant_type: "authorization_code", code },
  });

  if (!result.ok) return { ok: false, reason: result.message };

  const accountId = result.data.stripe_user_id?.trim();
  if (!accountId) {
    return { ok: false, reason: "Stripe did not return an account id." };
  }
  return { ok: true, accountId, livemode: result.data.livemode === true };
}

/**
 * Persists the connection.
 *
 * `updateMany` scoped by id so this is a no-op rather than a crash if the shop
 * disappeared between the redirect and the callback, and the currency is
 * stamped from the server's `PAYMENTS_CURRENCY` so the Payments tab can show
 * what this shop will actually be charged in.
 */
export async function saveConnection(
  shopId: string,
  accountId: string,
): Promise<void> {
  await db.shop.updateMany({
    where: { id: shopId },
    data: {
      stripeAccountId: accountId,
      stripeOnboardedAt: new Date(),
      currency: paymentsCurrency(),
    },
  });
}

/**
 * Revokes the platform's access and forgets the account.
 *
 * The local fields are cleared even when Stripe refuses the deauthorize call.
 * The alternative — refusing to disconnect because Stripe is having a bad
 * afternoon — leaves the shop pointed at an account it has decided to stop
 * using, which is the worse of the two failures. The reason is surfaced so the
 * owner can finish the revocation from the Stripe dashboard if needed.
 */
export async function disconnectShop(
  shopId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { stripeAccountId: true },
  });
  const accountId = shop?.stripeAccountId;
  if (!accountId) return { ok: true };

  const clientId = stripeClientId();
  let reason: string | null = null;

  if (clientId) {
    const result = await stripeFetch<{ stripe_user_id?: string }>(
      "/oauth/deauthorize",
      {
        connect: true,
        method: "POST",
        body: { client_id: clientId, stripe_user_id: accountId },
      },
    );
    if (!result.ok) reason = result.message;
  }

  await clearConnection(shopId);
  return reason ? { ok: false, reason } : { ok: true };
}

export async function clearConnection(shopId: string): Promise<void> {
  await db.shop.updateMany({
    where: { id: shopId },
    data: { stripeAccountId: null, stripeOnboardedAt: null },
  });
}

/**
 * Drops the connection for whichever shop owns this account.
 *
 * Called from the webhook when the owner disconnects from Stripe's side —
 * `account.application.deauthorized` is the only notice we get, and a shop
 * still holding a revoked account id would fail every charge with a confusing
 * permissions error.
 */
export async function clearConnectionByAccount(
  accountId: string,
): Promise<number> {
  const result = await db.shop.updateMany({
    where: { stripeAccountId: accountId },
    data: { stripeAccountId: null, stripeOnboardedAt: null },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Reading the connection
// ---------------------------------------------------------------------------

type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  default_currency?: string;
  country?: string;
  email?: string | null;
  business_profile?: { name?: string | null } | null;
  requirements?: { disabled_reason?: string | null } | null;
};

export type ConnectStatus = {
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  onboardedAt: string | null;
  testMode: boolean;
  currency: string;
  /** Null when the account could not be fetched — Stripe unreachable, say. */
  account: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    defaultCurrency: string | null;
    country: string | null;
    businessName: string | null;
    disabledReason: string | null;
  } | null;
  /** Set when the account lookup failed, so the tab can say why. */
  accountError: string | null;
};

/**
 * Everything the Payments tab needs about a shop's connection.
 *
 * The live `GET /v1/accounts/{id}` matters: an account can be connected and
 * still unable to take money because Stripe is waiting on identity documents,
 * and "connected" alone would tell the owner nothing about why their customers
 * are seeing declines.
 */
export async function connectStatus(shopId: string): Promise<ConnectStatus> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { stripeAccountId: true, stripeOnboardedAt: true, currency: true },
  });

  const accountId = shop?.stripeAccountId ?? null;
  const base: ConnectStatus = {
    configured: connectConfigured(),
    connected: Boolean(accountId),
    accountId,
    onboardedAt: shop?.stripeOnboardedAt?.toISOString() ?? null,
    testMode: stripeTestMode(),
    currency: shop?.currency ?? paymentsCurrency(),
    account: null,
    accountError: null,
  };

  if (!accountId || !stripeSecretKey()) return base;

  const result = await stripeFetch<StripeAccount>(
    `/v1/accounts/${encodeURIComponent(accountId)}`,
  );
  if (!result.ok) return { ...base, accountError: result.message };

  return {
    ...base,
    account: {
      chargesEnabled: result.data.charges_enabled === true,
      payoutsEnabled: result.data.payouts_enabled === true,
      detailsSubmitted: result.data.details_submitted === true,
      defaultCurrency: result.data.default_currency ?? null,
      country: result.data.country ?? null,
      businessName: result.data.business_profile?.name ?? null,
      disabledReason: result.data.requirements?.disabled_reason ?? null,
    },
  };
}
