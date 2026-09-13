import { cookies } from "next/headers";
import { SignJWT, importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";

import { authSecretKey } from "@/lib/session";

import {
  GOOGLE_ISSUERS,
  GOOGLE_SCOPE,
  googleAuthorizeUrl,
  googleClientId,
  googleClientSecret,
  googleJwksUrl,
  googleRedirectUri,
  googleTokenUrl,
} from "./config";

/**
 * The OpenID Connect protocol half of "Sign in with Google", written out by
 * hand with `fetch`. No auth framework: RepairPilot's session layer is
 * hand-rolled (lib/session.ts), and bolting NextAuth on beside it would give
 * the app two ideas about what "signed in" means.
 *
 * ---------------------------------------------------------------------------
 * WHAT PROTECTS THE CALLBACK, AND FROM WHAT
 * ---------------------------------------------------------------------------
 * The callback is a GET that Google causes, arriving with whatever cookies the
 * browser felt like sending. Three separate things have to line up:
 *
 *   1. `state` — an HS256 JWT signed with AUTH_SECRET, exactly the way
 *      lib/session.ts signs a login and lib/integrations/oauth.ts signs a
 *      connect. It carries the intent, the post-login path and a nonce. A
 *      forged callback cannot mint one, so it cannot choose the intent.
 *   2. The FLOW COOKIE — a second short-lived signed token, http-only, holding
 *      the PKCE verifier and the same nonce and id. `state` travels through
 *      Google and is visible in a URL bar and a referrer header; the verifier
 *      never leaves this browser. Matching them is what binds the callback to
 *      the browser that started it.
 *   3. The `id_token` itself — RS256, verified against Google's published
 *      JWKS, with `iss`, `aud`, `exp` and the `nonce` we sent all checked.
 *
 * SINGLE USE falls out of (2): the callback clears the flow cookie before it
 * does anything else, so replaying the same callback URL finds no verifier and
 * is refused. Nothing is stored server-side to make that true.
 * ---------------------------------------------------------------------------
 */

/** Ten minutes: long enough to pick an account, short enough to be useless later. */
const FLOW_TTL_S = 10 * 60;

/** The cookie holding the PKCE verifier while the browser is away at Google. */
export const GOOGLE_FLOW_COOKIE = "rf_goauth";

const STATE_KIND = "google-state";
const FLOW_KIND = "google-flow";

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

/**
 * What the person pressed the button for. It rides inside the signed `state`
 * rather than the query string of the callback, so it cannot be swapped —
 * "link this to my account" and "create a whole new shop" are very different
 * outcomes to leave a stranger in charge of.
 */
export type GoogleIntent =
  | { kind: "signin" }
  | { kind: "signup" }
  | { kind: "link" }
  /** Accepting a colleague's invite; the token is the one in the emailed link. */
  | { kind: "invite"; token: string };

export function parseIntent(raw: string | null | undefined): GoogleIntent | null {
  if (!raw || raw === "signin") return { kind: "signin" };
  if (raw === "signup") return { kind: "signup" };
  if (raw === "link") return { kind: "link" };
  if (raw.startsWith("invite:")) {
    const token = raw.slice("invite:".length);
    // Same shape check resolveResetToken() applies, so a junk suffix is
    // rejected here rather than turning into a database lookup.
    if (/^[a-f0-9]{32,128}$/i.test(token)) return { kind: "invite", token };
    return null;
  }
  return null;
}

export function formatIntent(intent: GoogleIntent): string {
  return intent.kind === "invite" ? `invite:${intent.token}` : intent.kind;
}

/**
 * The post-sign-in destination, guarded against being an open redirect.
 *
 * Same rule as app/(auth)/actions.ts: a same-origin, non-protocol-relative
 * path or nothing. An absolute URL is not "fixed up" — it is discarded, which
 * is the only safe reading of a `next` somebody else may have chosen.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // A backslash is a path separator to some browsers and not to others, which
  // is exactly the ambiguity `//evil.com` exploits.
  if (value.includes("\\")) return "/";
  return value;
}

// ---------------------------------------------------------------------------
// base64url + PKCE
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** RFC 7636 S256: challenge = base64url(sha256(verifier)). */
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Starting a flow
// ---------------------------------------------------------------------------

export type StartedFlow = { authorizeUrl: string; flowToken: string };

/**
 * Mints the nonce, the PKCE pair and the signed `state`, and builds the
 * authorize URL. The caller sets `flowToken` as GOOGLE_FLOW_COOKIE.
 *
 * `access_type=online` because RepairPilot never acts on a person's Google
 * account — it only wants to know who they are, so a refresh token would be a
 * long-lived credential kept for no reason. `prompt=select_account` because a
 * shared workstation at a front desk is the normal case, and silently reusing
 * whichever Google account the browser remembers is how the wrong technician
 * ends up signed in.
 */
export async function startFlow(input: {
  intent: GoogleIntent;
  next: string;
}): Promise<StartedFlow> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set.");

  const id = crypto.randomUUID();
  const nonce = randomBase64url(24);
  const verifier = randomBase64url(48);
  const now = Math.floor(Date.now() / 1000);

  const state = await new SignJWT({
    kind: STATE_KIND,
    id,
    nonce,
    intent: formatIntent(input.intent),
    next: safeNextPath(input.next),
  } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + FLOW_TTL_S)
    .sign(authSecretKey());

  // The verifier stays here. It is the half of the exchange that never
  // travels through Google, and therefore never appears in a URL, a referrer
  // or a proxy log.
  const flowToken = await new SignJWT({
    kind: FLOW_KIND,
    id,
    nonce,
    verifier,
  } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + FLOW_TTL_S)
    .sign(authSecretKey());

  const url = new URL(googleAuthorizeUrl());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", await s256(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  return { authorizeUrl: url.toString(), flowToken };
}

// ---------------------------------------------------------------------------
// Reading a flow back
// ---------------------------------------------------------------------------

export type VerifiedState = {
  id: string;
  nonce: string;
  intent: GoogleIntent;
  next: string;
};

/** Verifies the `state` handed back by Google. Null for anything at all wrong. */
export async function verifyState(
  token: string | null | undefined,
): Promise<VerifiedState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecretKey(), {
      algorithms: ["HS256"],
    });
    if (payload.kind !== STATE_KIND) return null;

    const { id, nonce, intent, next } = payload as Record<string, unknown>;
    if (typeof id !== "string" || typeof nonce !== "string") return null;

    const parsed = parseIntent(typeof intent === "string" ? intent : null);
    if (!parsed) return null;

    return {
      id,
      nonce,
      intent: parsed,
      next: safeNextPath(typeof next === "string" ? next : null),
    };
  } catch {
    // Expired, tampered with, or signed by a different AUTH_SECRET.
    return null;
  }
}

/**
 * Reads the flow cookie AND clears it, in one call, whatever the outcome.
 *
 * Clearing unconditionally is the single-use rule: by the time this returns,
 * the PKCE verifier is gone from the browser, so the same callback URL replayed
 * a second later has nothing to match against.
 */
export async function takeFlowCookie(): Promise<{
  id: string;
  nonce: string;
  verifier: string;
} | null> {
  const jar = await cookies();
  const raw = jar.get(GOOGLE_FLOW_COOKIE)?.value;
  jar.set(GOOGLE_FLOW_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, authSecretKey(), {
      algorithms: ["HS256"],
    });
    if (payload.kind !== FLOW_KIND) return null;

    const { id, nonce, verifier } = payload as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof nonce !== "string" ||
      typeof verifier !== "string"
    ) {
      return null;
    }
    return { id, nonce, verifier };
  } catch {
    return null;
  }
}

/** The cookie options the start route writes GOOGLE_FLOW_COOKIE with. */
export function flowCookieOptions() {
  return {
    httpOnly: true,
    // `lax` rather than `strict`: the callback is a top-level GET navigation
    // caused by Google, and a strict cookie would not be sent with it.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FLOW_TTL_S,
  };
}

// ---------------------------------------------------------------------------
// The token exchange
// ---------------------------------------------------------------------------

/** Everything the callback is allowed to believe about the person. */
export type GoogleIdentity = {
  /** Google's stable account id. THE identity key — never the email. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

export class GoogleAuthError extends Error {
  /** The short code the redirect carries, mapped to a sentence on the page. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

/**
 * Authorization code -> verified identity.
 *
 * The client secret goes in the POST body because that is the only form
 * Google's token endpoint documents for a web-server client. Nothing here is
 * ever logged: an id_token is a bearer assertion of who somebody is, and the
 * secret is the application itself.
 */
export async function exchangeCodeForIdentity(input: {
  code: string;
  verifier: string;
  nonce: string;
}): Promise<GoogleIdentity> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      "not-configured",
      "Google sign-in is not configured on this server.",
    );
  }

  let response: Response;
  try {
    response = await fetch(googleTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(),
        code_verifier: input.verifier,
      }),
      cache: "no-store",
    });
  } catch {
    throw new GoogleAuthError(
      "unreachable",
      "Google could not be reached just now.",
    );
  }

  if (!response.ok) {
    // The body can hold `error_description`, which is useful in a server log
    // and useless on a sign-in form. It is deliberately not passed on.
    console.warn(
      `[google] token exchange failed: HTTP ${response.status} ${response.statusText}`,
    );
    throw new GoogleAuthError("exchange-failed", "Google refused the sign-in.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError("exchange-failed", "Google refused the sign-in.");
  }

  const idToken = body.id_token;
  if (typeof idToken !== "string") {
    throw new GoogleAuthError(
      "exchange-failed",
      "Google's answer did not include an identity.",
    );
  }

  // The userinfo endpoint is NOT consulted. A bearer call to an endpoint that
  // answers "here is who that token belongs to" is only as good as the
  // transport; the id_token is signed, and the signature is the whole point.
  return verifyIdToken(idToken, input.nonce);
}

// ---------------------------------------------------------------------------
// id_token verification
// ---------------------------------------------------------------------------

type JwksCache = { keys: JWK[]; expiresAt: number };

let jwksCache: JwksCache | null = null;
/** Refuse to re-fetch more often than this, even on an unknown kid. */
const JWKS_MIN_INTERVAL_MS = 30 * 1000;
let jwksFetchedAt = 0;

/** Google always sends one; a missing/odd header falls back to five minutes. */
function cacheMaxAgeMs(header: string | null): number {
  const match = /max-age\s*=\s*(\d+)/i.exec(header ?? "");
  const seconds = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return 5 * 60 * 1000;
  // A day is plenty; Google rotates far more often than that.
  return Math.min(seconds, 86_400) * 1000;
}

async function fetchJwks(): Promise<JwksCache> {
  const response = await fetch(googleJwksUrl(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new GoogleAuthError(
      "jwks",
      "Google's signing keys could not be fetched.",
    );
  }
  const body = (await response.json()) as { keys?: JWK[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new GoogleAuthError(
      "jwks",
      "Google's signing keys could not be fetched.",
    );
  }
  jwksFetchedAt = Date.now();
  return {
    keys: body.keys,
    // Honour the endpoint's own Cache-Control, which is how Google tells
    // clients when it plans to rotate.
    expiresAt: Date.now() + cacheMaxAgeMs(response.headers.get("cache-control")),
  };
}

/**
 * The signing key for one `kid`, from a cache that honours Google's
 * Cache-Control.
 *
 * An unknown `kid` refetches once — that is a normal key rotation, and failing
 * the sign-in instead would take everybody out until the cache expired. The
 * 30-second floor stops a stream of forged tokens with random `kid`s from
 * turning into a stream of outbound requests.
 */
async function signingKey(kid: string, alg: string) {
  if (!jwksCache || jwksCache.expiresAt <= Date.now()) {
    jwksCache = await fetchJwks();
  }

  let jwk = jwksCache.keys.find((key) => key.kid === kid);
  if (!jwk && Date.now() - jwksFetchedAt > JWKS_MIN_INTERVAL_MS) {
    jwksCache = await fetchJwks();
    jwk = jwksCache.keys.find((key) => key.kid === kid);
  }
  if (!jwk) {
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }

  return importJWK(jwk, jwk.alg ?? alg);
}

/**
 * Verifies an id_token properly: signature against Google's published JWKS,
 * then `iss`, `aud`, `exp` (jose enforces the last two from the options) and
 * the `nonce` this browser's flow cookie says we sent.
 *
 * Every failure is the same short answer to the person. Which check failed is
 * a detail for the server log, not for whoever is holding the forged token.
 */
export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<GoogleIdentity> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new GoogleAuthError(
      "not-configured",
      "Google sign-in is not configured on this server.",
    );
  }

  let header: { kid?: string; alg?: string };
  try {
    const [encodedHeader] = idToken.split(".");
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }
  // RS256 only. Anything else — including `none` — is a forgery attempt, and
  // pinning it here means a surprising `alg` never reaches the verifier.
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    console.warn(`[google] id_token rejected: alg was ${header.alg}, not RS256`);
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }

  const key = await signingKey(header.kid, "RS256");

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, key, {
      algorithms: ["RS256"],
      issuer: [...GOOGLE_ISSUERS],
      audience: clientId,
      // A minute of clock skew, no more. `exp` is enforced by jose.
      clockTolerance: 60,
    }));
  } catch (error) {
    console.warn(
      `[google] id_token rejected: ${error instanceof Error ? error.message : "unknown"}`,
    );
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }

  // The nonce ties this token to the flow cookie in THIS browser: a valid
  // id_token captured from somewhere else is still refused here.
  if (payload.nonce !== expectedNonce) {
    console.warn("[google] id_token rejected: nonce did not match");
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }

  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== "string" || !sub || typeof email !== "string" || !email) {
    throw new GoogleAuthError("bad-token", "That Google sign-in was not valid.");
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const picture = typeof payload.picture === "string" ? payload.picture : "";

  return {
    sub,
    email: email.trim().toLowerCase(),
    // Google sends a real boolean; some libraries relay the string. Anything
    // that is not unambiguously true is treated as false, which is the only
    // safe default — see lib/google/account.ts for what rides on it.
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: name || null,
    // Only an http(s) URL is kept: this ends up in an <img src> on the
    // settings page, and `javascript:` / `data:` have no business there.
    // Google always sends https; plain http exists for the dev fake IdP.
    picture: /^https?:\/\//.test(picture) ? picture : null,
  };
}
