import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature verification for the two inbound webhooks.
 *
 * BOTH FAIL CLOSED. If the shared secret for a provider is not configured, the
 * request is REFUSED, not accepted — an inbound endpoint that trusts anything
 * is a way for a stranger to write comments onto a customer's repair ticket and
 * to read which tickets exist by watching what gets created.
 *
 * The one deliberate exception is the generic JSON email route, which is
 * guarded by `?token=INBOUND_SECRET` instead. That is for the shop forwarding
 * mail through their own script, and it is still a secret that must be set.
 */

/** Constant-time compare of two buffers, tolerant of length mismatch. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resend (Svix)
// ---------------------------------------------------------------------------

/** How old a signed timestamp may be. Svix's own default. */
const SVIX_TOLERANCE_SECONDS = 300;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies a Resend inbound webhook, which is delivered through Svix.
 *
 *   svix-id         the message id
 *   svix-timestamp  unix seconds
 *   svix-signature  space-separated `v1,<base64>` entries — plural during a
 *                   secret rotation, so ANY match is accepted
 *
 * The signed content is `${id}.${timestamp}.${rawBody}` and the key is the
 * base64 payload of the `whsec_…` secret, NOT the string itself. Using the
 * literal string is the classic Svix integration bug.
 */
export function verifyResendSignature(input: {
  payload: string;
  secret: string;
  headers: Headers;
  nowMs?: number;
}): VerifyResult {
  const id = input.headers.get("svix-id") ?? input.headers.get("webhook-id");
  const timestamp =
    input.headers.get("svix-timestamp") ?? input.headers.get("webhook-timestamp");
  const signature =
    input.headers.get("svix-signature") ?? input.headers.get("webhook-signature");

  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing svix signature headers" };
  }

  const seconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(seconds)) {
    return { ok: false, reason: "malformed svix-timestamp" };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  // Both directions: a far-future timestamp is as suspicious as a stale one.
  if (Math.abs(nowSeconds - seconds) > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${input.payload}`, "utf8")
    .digest();

  // Every candidate is compared even after a match, so the work done does not
  // depend on which signature was the right one.
  let matched = false;
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    if (safeEqual(Buffer.from(value, "base64"), expected)) matched = true;
  }

  return matched ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

/**
 * Verifies `X-Twilio-Signature`.
 *
 * Twilio's scheme: base64(HMAC-SHA1(url + every POST parameter, sorted by name
 * and concatenated as name+value with no separators, using the account's auth
 * token)). SHA-1 is Twilio's choice, not ours — it is what the header contains.
 *
 * THE URL MUST BE THE ONE TWILIO CALLED, byte for byte, including the query
 * string and the scheme. Behind a proxy that terminates TLS, `request.url` says
 * `http://` while Twilio signed `https://`, which is the reason nearly every
 * first Twilio integration fails — hence `publicUrlFor` below.
 */
export function verifyTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
  authToken: string;
}): VerifyResult {
  if (!input.signature) return { ok: false, reason: "missing X-Twilio-Signature" };

  const data = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + input.params[key], input.url);

  const expected = createHmac("sha1", input.authToken).update(data, "utf8").digest();

  return safeEqual(Buffer.from(input.signature, "base64"), expected)
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}

/**
 * The absolute URL a provider actually called.
 *
 * Prefers the proxy's `x-forwarded-*` headers, because those describe the
 * request as it arrived at the edge — which is what the provider signed. Falls
 * back to the request's own URL when there is no proxy in front.
 */
export function publicUrlFor(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (proto) url.protocol = `${proto.split(",")[0].trim()}:`;
  if (host) url.host = host.split(",")[0].trim();

  return url.toString();
}
