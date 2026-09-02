/**
 * The one place a Stripe HTTP call is made.
 *
 * WHY A HELPER AND NOT AN SDK
 * ---------------------------
 * Same reasoning as lib/comms/drivers.ts and ./checkout.ts: Stripe's REST API
 * is form-encoded POSTs and JSON responses, which `fetch` already does. What
 * an SDK would buy us — retries, typed models — we either do not want (a
 * silent retry on a charge is a double charge) or do not need.
 *
 * WHAT THIS ADDS OVER A BARE fetch
 * --------------------------------
 *   · `Stripe-Account`     added whenever the caller passes a connected
 *                          account id, so a shop that onboarded through
 *                          Connect has every call — Checkout, PaymentIntents,
 *                          Customers, Refunds, Terminal — land on ITS account
 *                          and not the platform's. Omit it and the call runs
 *                          in direct mode on the platform key, which is
 *                          exactly how every shop worked before Connect.
 *   · `Idempotency-Key`    passed straight through; every money-moving caller
 *                          derives one from the business operation.
 *   · error normalisation  one `{ ok: false, message, code, declineCode }`
 *                          shape, so a decline reads the same at the counter
 *                          as it does in a background job.
 *   · a base-URL override  `STRIPE_API_BASE` / `STRIPE_CONNECT_BASE`. Unset in
 *                          production; pointed at scripts/dev/fake-stripe.mjs
 *                          in development so every flow in this module can be
 *                          exercised end to end without live keys.
 *
 * FAIL CLOSED. No secret key means no request is attempted at all.
 */

import { stripeSecretKey } from "./config";

/** Abandon rather than hang a Server Action behind a slow processor. */
const TIMEOUT_MS = 20_000;

/** Pinned so a Stripe API upgrade is a deliberate edit, not a surprise. */
export const STRIPE_API_VERSION = "2024-06-20";

/** api.stripe.com — the REST API. */
export function stripeApiBase(): string {
  return trimSlash(process.env.STRIPE_API_BASE?.trim() || "https://api.stripe.com");
}

/**
 * connect.stripe.com — OAuth authorize/token/deauthorize, a different host.
 *
 * Falls back to `STRIPE_API_BASE` when only that is set, so a single fake
 * server can stand in for both hosts in development.
 */
export function stripeConnectBase(): string {
  const explicit = process.env.STRIPE_CONNECT_BASE?.trim();
  if (explicit) return trimSlash(explicit);
  const api = process.env.STRIPE_API_BASE?.trim();
  if (api) return trimSlash(api);
  return "https://connect.stripe.com";
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The Connect OAuth client id (ca_…). Platform-level, not per shop. */
export function stripeClientId(): string | null {
  return process.env.STRIPE_CLIENT_ID?.trim() || null;
}

/**
 * True when the platform key is a test key.
 *
 * The only thing derived from it that reaches the browser is a boolean — it
 * decides whether Terminal discovers simulated readers. The key itself never
 * leaves the server.
 */
export function stripeTestMode(): boolean {
  return stripeSecretKey()?.startsWith("sk_test_") ?? false;
}

// ---------------------------------------------------------------------------
// Request/response shapes
// ---------------------------------------------------------------------------

export type StripeOk<T> = { ok: true; data: T };

export type StripeFail = {
  ok: false;
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  /** Stripe's machine-readable error code, e.g. "card_declined". */
  code: string | null;
  /** Stripe's `decline_code` on a card error, e.g. "insufficient_funds". */
  declineCode: string | null;
  /** Already safe to show a human — Stripe's messages are written for one. */
  message: string;
};

export type StripeResult<T> = StripeOk<T> | StripeFail;

export type StripeRequest = {
  method?: "GET" | "POST" | "DELETE";
  /** Form body. Nested objects/arrays are flattened into Stripe's bracket syntax. */
  body?: Record<string, unknown>;
  /** Query string for GETs, flattened the same way. */
  query?: Record<string, unknown>;
  /** The connected account this call acts on behalf of, when there is one. */
  account?: string | null;
  /** Derived from the business operation by the caller, never from the request. */
  idempotencyKey?: string;
  /** Use connect.stripe.com instead of api.stripe.com (OAuth endpoints only). */
  connect?: boolean;
};

/**
 * Flattens `{ metadata: { a: 1 }, payment_method_types: ["card"] }` into
 * `metadata[a]=1&payment_method_types[0]=card` — Stripe's encoding.
 *
 * `undefined` and `null` values are dropped rather than sent as the strings
 * "undefined"/"null", which Stripe would happily store in metadata forever.
 */
export function encodeForm(
  input: Record<string, unknown>,
  params = new URLSearchParams(),
  prefix = "",
): URLSearchParams {
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item === undefined || item === null) return;
        if (typeof item === "object") {
          encodeForm(item as Record<string, unknown>, params, `${name}[${index}]`);
        } else {
          params.set(`${name}[${index}]`, String(item));
        }
      });
      continue;
    }

    if (typeof value === "object") {
      encodeForm(value as Record<string, unknown>, params, name);
      continue;
    }

    params.set(name, typeof value === "boolean" ? String(value) : String(value));
  }
  return params;
}

type StripeErrorBody = {
  error?: {
    message?: string;
    code?: string;
    decline_code?: string;
    type?: string;
  };
};

/**
 * One Stripe call.
 *
 * `path` is everything after the host, e.g. "/v1/payment_intents" or
 * "/oauth/token". Never throws — a network failure comes back as a
 * `{ ok: false, status: 0 }` the caller has to handle like any other refusal.
 */
export async function stripeFetch<T>(
  path: string,
  request: StripeRequest = {},
): Promise<StripeResult<T>> {
  const key = stripeSecretKey();
  if (!key) {
    return {
      ok: false,
      status: 0,
      code: "not_configured",
      declineCode: null,
      message: "Online payments are not configured on this server.",
    };
  }

  const base = request.connect ? stripeConnectBase() : stripeApiBase();
  const method = request.method ?? (request.body ? "POST" : "GET");

  let url = `${base}${path}`;
  if (request.query) {
    const query = encodeForm(request.query).toString();
    if (query) url += `?${query}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  // The whole point of Connect: this header is what makes a charge land in the
  // shop's account rather than the platform's. Absent = direct mode.
  if (request.account) headers["Stripe-Account"] = request.account;
  if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;

  let body: string | undefined;
  if (request.body) {
    body = encodeForm(request.body).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | (T & StripeErrorBody)
      | null;

    if (!response.ok || payload === null) {
      const error = payload?.error;
      return {
        ok: false,
        status: response.status,
        code: error?.code ?? error?.type ?? null,
        declineCode: error?.decline_code ?? null,
        message: error?.message ?? `Stripe returned ${response.status}.`,
      };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    console.error(`[payments] ${method} ${path} failed:`, error);
    return {
      ok: false,
      status: 0,
      code: "network_error",
      declineCode: null,
      message: "Could not reach Stripe. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Common object shapes
// ---------------------------------------------------------------------------

/** Only the fields this app actually reads. Stripe sends far more. */
export type StripePaymentIntent = {
  id: string;
  status: string;
  amount: number;
  amount_received?: number | null;
  currency: string;
  latest_charge?: string | { id?: string } | null;
  last_payment_error?: {
    message?: string;
    code?: string;
    decline_code?: string;
  } | null;
  metadata?: Record<string, string> | null;
};

export type StripeCharge = {
  id: string;
  payment_intent?: string | null;
  amount_refunded?: number;
  refunded?: boolean;
  metadata?: Record<string, string> | null;
  refunds?: { data?: { id: string; status?: string; amount?: number }[] } | null;
};

export type StripeRefundObject = {
  id: string;
  status?: string;
  amount?: number;
  payment_intent?: string | null;
  charge?: string | null;
};

/** `latest_charge` is a string when unexpanded and an object when expanded. */
export function chargeIdOf(
  intent: Pick<StripePaymentIntent, "latest_charge">,
): string | null {
  const charge = intent.latest_charge;
  if (!charge) return null;
  return typeof charge === "string" ? charge : (charge.id ?? null);
}
