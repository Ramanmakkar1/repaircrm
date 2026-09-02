import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { db } from "@/lib/db";
import {
  PROVIDER_LABEL,
  qboClientId,
  qboClientSecret,
  qboOAuthBase,
  xeroClientId,
  xeroClientSecret,
  xeroIdentityBase,
  type ProviderName,
} from "./config";
import type { ConnectionSettings, ConnectionStatus } from "./types";

/**
 * OAuth plumbing shared by QuickBooks Online and Xero.
 *
 * Both are textbook authorization-code grants with a confidential client, so
 * one token exchange, one refresh and one "run this with a live access token"
 * helper serve both. Only the endpoints differ, and those come from
 * lib/integrations/config.ts.
 *
 * ---------------------------------------------------------------------------
 * THE `state` PARAMETER IS A SIGNED TOKEN, NOT A RANDOM STRING
 * ---------------------------------------------------------------------------
 * The callback runs before any session check can be trusted: it is a GET the
 * provider caused, arriving with whatever cookies the browser felt like
 * sending. `state` therefore carries the tenant identity itself — the shopId
 * the connect route was standing in — signed with AUTH_SECRET exactly the way
 * lib/session.ts signs a login, plus a nonce so two connects in flight cannot
 * be confused for one another and a replayed URL is distinguishable.
 *
 * The consequence: a forged callback cannot attach someone else's QuickBooks
 * company to your shop, because it cannot mint a `state` that names your shop.
 * Five minutes of validity — an OAuth consent screen is not a coffee break.
 * ---------------------------------------------------------------------------
 */

/** How long a `state` token is accepted for. */
const STATE_TTL_S = 5 * 60;

/**
 * Refresh this many seconds BEFORE the access token actually expires.
 *
 * A token that expires mid-request is a 401 halfway through a sync, which
 * leaves half a batch pushed and a confusing error on the card. Sixty seconds
 * costs one extra refresh a day and removes the whole class of failure.
 */
const EARLY_REFRESH_MS = 60 * 1000;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add it to .env before starting the app.",
    );
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The provider rejected our credentials. The connection needs reconnecting. */
export class IntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationAuthError";
  }
}

/** The provider answered 429. `retryAfterMs` is what it asked us to wait. */
export class IntegrationRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "IntegrationRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Anything else the provider said no to, with its own words kept. */
export class IntegrationApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "IntegrationApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Signed state
// ---------------------------------------------------------------------------

export type OAuthState = { shopId: string; provider: ProviderName; nonce: string };

export async function signState(
  shopId: string,
  provider: ProviderName,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Web Crypto rather than node:crypto: this module is reachable from
  // lib/jobs, which Next compiles for the Edge runtime as well as Node, and a
  // `node:` import there is a build warning for a UUID either one can make.
  const nonce = crypto.randomUUID();
  return new SignJWT({ shopId, provider, nonce } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + STATE_TTL_S)
    .setSubject(shopId)
    .sign(secretKey());
}

/**
 * Verifies a callback's `state`.
 *
 * `provider` is checked against the token as well as the URL, so a state minted
 * for the Xero connect flow cannot be replayed at the QuickBooks callback.
 */
export async function verifyState(
  token: string | null | undefined,
  provider: ProviderName,
): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const { shopId, provider: signedProvider, nonce } = payload as Record<
      string,
      unknown
    >;
    if (
      typeof shopId !== "string" ||
      typeof nonce !== "string" ||
      signedProvider !== provider
    ) {
      return null;
    }
    return { shopId, provider, nonce };
  } catch {
    // Expired, tampered with, or signed by a different AUTH_SECRET.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token endpoints
// ---------------------------------------------------------------------------

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry, already adjusted for nothing — the raw provider value. */
  expiresAt: Date;
};

type Credentials = { clientId: string; clientSecret: string; tokenUrl: string };

function credentials(provider: ProviderName): Credentials {
  if (provider === "quickbooks") {
    const clientId = qboClientId();
    const clientSecret = qboClientSecret();
    if (!clientId || !clientSecret) {
      throw new Error(
        "QuickBooks is not configured on this server — set QBO_CLIENT_ID and QBO_CLIENT_SECRET.",
      );
    }
    return {
      clientId,
      clientSecret,
      tokenUrl: `${qboOAuthBase()}/oauth2/v1/tokens/bearer`,
    };
  }

  const clientId = xeroClientId();
  const clientSecret = xeroClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Xero is not configured on this server — set XERO_CLIENT_ID and XERO_CLIENT_SECRET.",
    );
  }
  return {
    clientId,
    clientSecret,
    tokenUrl: `${xeroIdentityBase()}/connect/token`,
  };
}

/**
 * Both providers accept HTTP Basic for a confidential client, which keeps the
 * secret out of the request body (and therefore out of proxy access logs).
 */
function basicAuth({ clientId, clientSecret }: Credentials): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function postToken(
  provider: ProviderName,
  body: URLSearchParams,
): Promise<TokenSet> {
  const creds = credentials(provider);
  const response = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuth(creds),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    // 400 invalid_grant is the ordinary "this refresh token is dead" answer
    // from both providers; it is an auth failure, not a transient one.
    if (response.status === 400 || response.status === 401) {
      throw new IntegrationAuthError(
        `${PROVIDER_LABEL[provider]} rejected the credentials (${response.status}). Reconnect the account.`,
      );
    }
    throw new IntegrationApiError(response.status, text);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new IntegrationApiError(response.status, text);
  }

  const accessToken = parsed.access_token;
  const refreshToken = parsed.refresh_token;
  const expiresIn = Number(parsed.expires_in);

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new IntegrationApiError(
      response.status,
      "token response was missing access_token or refresh_token",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(
      Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    ),
  };
}

/** Authorization code -> tokens. Called once, from the callback route. */
export async function exchangeCode(
  provider: ProviderName,
  code: string,
  redirect: string,
): Promise<TokenSet> {
  return postToken(
    provider,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  );
}

/**
 * Refresh token -> tokens.
 *
 * BOTH PROVIDERS ROTATE THE REFRESH TOKEN. The new one must be persisted or
 * the connection dies at the next refresh, so every caller writes the whole
 * TokenSet back rather than only the access token.
 */
export async function refreshTokens(
  provider: ProviderName,
  refreshToken: string,
): Promise<TokenSet> {
  return postToken(
    provider,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

// ---------------------------------------------------------------------------
// Connection persistence
// ---------------------------------------------------------------------------

/** A connection with a token known to be valid for at least another minute. */
export type LiveConnection = {
  id: string;
  shopId: string;
  provider: ProviderName;
  accessToken: string;
  /** QuickBooks realmId / Xero tenantId. Never null for a live connection. */
  tenantId: string;
  tenantName: string | null;
  lastSyncAt: Date | null;
  settings: ConnectionSettings;
};

/** Reads `IntegrationConnection.settings`, tolerating every shape it can hold. */
export function readSettings(value: unknown): ConnectionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ConnectionSettings;
}

/**
 * Merges a patch into the connection's settings without discarding the keys
 * this particular write is not setting — the blob holds the operator's account
 * codes alongside the last run's report card, and a sync must never clobber a
 * preference an operator saved while it was running.
 */
export async function mergeConnectionSettings(
  shopId: string,
  provider: ProviderName,
  patch: ConnectionSettings,
): Promise<void> {
  const current = await db.integrationConnection.findFirst({
    where: { shopId, provider },
    select: { id: true, settings: true },
  });
  if (!current) return;

  await db.integrationConnection.update({
    where: { id: current.id },
    data: {
      settings: {
        ...readSettings(current.settings),
        ...patch,
      } as never,
    },
  });
}

/** Records a failure on the connection so the settings card can explain it. */
export async function markConnectionError(
  shopId: string,
  provider: ProviderName,
  error: unknown,
  status: ConnectionStatus = "error",
): Promise<void> {
  await db.integrationConnection.updateMany({
    where: { shopId, provider },
    data: { status, lastError: describe(error) },
  });
}

export function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

/**
 * Runs `fn` with a live access token for this shop's connection.
 *
 * Everything the rest of the codebase should ever need from OAuth:
 *
 *   1. loads the connection FOR THIS SHOP (never by id alone — a link between
 *      tenants is exactly what multi-tenancy forbids),
 *   2. refreshes when the token expires within EARLY_REFRESH_MS and persists
 *      the rotated pair before using it,
 *   3. clears `lastError` and stamps "connected" on success,
 *   4. on an auth failure marks the connection "error" with the provider's own
 *      words and rethrows, so the caller reports rather than retries.
 *
 * Returns null when there is nothing usable to run against — no connection, a
 * disconnected one, or a Xero grant still waiting on a tenant choice.
 */
export async function withConnection<T>(
  shopId: string,
  provider: ProviderName,
  fn: (connection: LiveConnection) => Promise<T>,
): Promise<T | null> {
  const row = await db.integrationConnection.findFirst({
    where: { shopId, provider },
  });
  if (!row) return null;
  if (row.status === "disconnected" || row.status === "pending") return null;
  if (!row.remoteTenantId) return null;

  let accessToken = row.accessToken;

  if (row.expiresAt.getTime() - Date.now() <= EARLY_REFRESH_MS) {
    try {
      const tokens = await refreshTokens(provider, row.refreshToken);
      await db.integrationConnection.update({
        where: { id: row.id },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          status: "connected",
          lastError: null,
        },
      });
      accessToken = tokens.accessToken;
    } catch (error) {
      await markConnectionError(shopId, provider, error);
      throw error;
    }
  }

  const connection: LiveConnection = {
    id: row.id,
    shopId: row.shopId,
    provider,
    accessToken,
    tenantId: row.remoteTenantId,
    tenantName: row.remoteTenantName,
    lastSyncAt: row.lastSyncAt,
    settings: readSettings(row.settings),
  };

  try {
    const result = await fn(connection);
    if (row.status !== "connected" || row.lastError) {
      await db.integrationConnection.update({
        where: { id: row.id },
        data: { status: "connected", lastError: null },
      });
    }
    return result;
  } catch (error) {
    if (error instanceof IntegrationAuthError) {
      await markConnectionError(shopId, provider, error);
    }
    throw error;
  }
}

/**
 * Turns a `Retry-After` header into milliseconds.
 * Both a delta-seconds and an HTTP-date form are legal; a missing or nonsense
 * value falls back to a minute, which is longer than either provider's window.
 */
export function retryAfterMs(header: string | null): number {
  if (!header) return 60_000;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 3600) * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 3_600_000));
  return 60_000;
}
