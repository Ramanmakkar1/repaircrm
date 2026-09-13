import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { db } from "@/lib/db";
import {
  SQUARE_OAUTH_SCOPES,
  squareApplicationId,
  squareApplicationSecret,
  squareConfigured,
  squareOAuthBase,
  squareRedirectUri,
} from "./config";
import { squareRequest } from "./api";

const PROVIDER = "square";
const STATE_TTL_SECONDS = 10 * 60;
const REFRESH_EARLY_MS = 24 * 60 * 60 * 1000;

function stateSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is required for Square OAuth state.");
  return new TextEncoder().encode(value);
}

export async function signSquareState(shopId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ shopId, provider: PROVIDER, nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + STATE_TTL_SECONDS)
    .setSubject(shopId)
    .sign(stateSecret());
}

export async function verifySquareState(value: string | null): Promise<string | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, stateSecret(), { algorithms: ["HS256"] });
    const data = payload as JWTPayload & { shopId?: unknown; provider?: unknown };
    return data.provider === PROVIDER && typeof data.shopId === "string"
      ? data.shopId
      : null;
  } catch {
    return null;
  }
}

export async function squareAuthorizeUrl(shopId: string): Promise<string> {
  const applicationId = squareApplicationId();
  if (!applicationId) throw new Error("SQUARE_APPLICATION_ID is not set.");
  const query = new URLSearchParams({
    client_id: applicationId,
    scope: SQUARE_OAUTH_SCOPES.join(" "),
    session: "false",
    state: await signSquareState(shopId),
  });
  return `${squareOAuthBase()}/oauth2/authorize?${query.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  merchant_id?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const clientId = squareApplicationId();
  const clientSecret = squareApplicationSecret();
  if (!clientId || !clientSecret) throw new Error("Square is not configured.");
  const response = await fetch(`${squareOAuthBase()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Square rejected OAuth (${response.status}): ${text.slice(0, 240)}`);
  return JSON.parse(text) as TokenResponse;
}

function tokenExpiry(raw: string | undefined): Date {
  const parsed = raw ? new Date(raw) : new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
  return Number.isNaN(parsed.getTime())
    ? new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
    : parsed;
}

export async function connectSquare(shopId: string, code: string): Promise<void> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: squareRedirectUri(),
  });
  if (!tokens.access_token || !tokens.refresh_token || !tokens.merchant_id) {
    throw new Error("Square OAuth response was incomplete.");
  }

  let merchantName: string | null = null;
  let country: string | null = null;
  let locationId: string | null = null;
  let locationName: string | null = null;
  try {
    const [merchant, locations] = await Promise.all([
      squareRequest<{ merchant?: { business_name?: string; country?: string } }>({
        path: `/v2/merchants/${encodeURIComponent(tokens.merchant_id)}`,
        accessToken: tokens.access_token,
      }),
      squareRequest<{ locations?: { id?: string; name?: string; status?: string; country?: string }[] }>({
        path: "/v2/locations",
        accessToken: tokens.access_token,
      }),
    ]);
    merchantName = merchant.merchant?.business_name?.trim() || null;
    country = merchant.merchant?.country?.trim() || null;
    const active = locations.locations?.find((item) => item.status === "ACTIVE" && item.id)
      ?? locations.locations?.find((item) => item.id);
    locationId = active?.id ?? null;
    locationName = active?.name?.trim() || null;
    country ||= active?.country?.trim() || null;
  } catch {
    // The connection is still valid; the Payments tab can retry profile data.
  }

  await db.integrationConnection.upsert({
    where: { shopId_provider: { shopId, provider: PROVIDER } },
    create: {
      shopId,
      provider: PROVIDER,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokenExpiry(tokens.expires_at),
      remoteTenantId: tokens.merchant_id,
      remoteTenantName: merchantName,
      status: "connected",
      settings: { kind: "payments", country, locationId, locationName },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokenExpiry(tokens.expires_at),
      remoteTenantId: tokens.merchant_id,
      remoteTenantName: merchantName,
      status: "connected",
      lastError: null,
      settings: { kind: "payments", country, locationId, locationName },
    },
  });
}

export type SquareConnection = {
  id: string;
  shopId: string;
  accessToken: string;
  merchantId: string;
  merchantName: string | null;
  settings: { country?: string | null; locationId?: string | null; locationName?: string | null };
};

export type SquareConnectionStatus = {
  configured: boolean;
  webhookReady: boolean;
  connected: boolean;
  merchantId: string | null;
  merchantName: string | null;
  country: string | null;
  locationId: string | null;
  locationName: string | null;
  status: string;
  error: string | null;
};

export async function squareConnectionStatus(shopId: string): Promise<SquareConnectionStatus> {
  const { squareWebhookReady } = await import("./config");
  const row = await db.integrationConnection.findUnique({
    where: { shopId_provider: { shopId, provider: PROVIDER } },
    select: {
      remoteTenantId: true,
      remoteTenantName: true,
      status: true,
      lastError: true,
      settings: true,
    },
  });
  const settings = readSettings(row?.settings);
  return {
    configured: squareConfigured(),
    webhookReady: squareWebhookReady(),
    connected: row?.status === "connected" && Boolean(row.remoteTenantId),
    merchantId: row?.remoteTenantId ?? null,
    merchantName: row?.remoteTenantName ?? null,
    country: settings.country ?? null,
    locationId: settings.locationId ?? null,
    locationName: settings.locationName ?? null,
    status: row?.status ?? "none",
    error: row?.lastError ?? null,
  };
}

function readSettings(value: unknown): SquareConnection["settings"] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SquareConnection["settings"])
    : {};
}

async function refreshSquare(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function withSquareConnection<T>(
  shopId: string,
  fn: (connection: SquareConnection) => Promise<T>,
): Promise<T | null> {
  if (!squareConfigured()) return null;
  const row = await db.integrationConnection.findUnique({
    where: { shopId_provider: { shopId, provider: PROVIDER } },
  });
  if (!row || row.status !== "connected" || !row.remoteTenantId) return null;

  let accessToken = row.accessToken;
  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - Date.now() <= REFRESH_EARLY_MS) {
    try {
      const tokens = await refreshSquare(row.refreshToken);
      if (!tokens.access_token || !tokens.refresh_token) throw new Error("Square refresh response was incomplete.");
      accessToken = tokens.access_token;
      expiresAt = tokenExpiry(tokens.expires_at);
      await db.integrationConnection.update({
        where: { id: row.id },
        data: { accessToken, refreshToken: tokens.refresh_token, expiresAt, lastError: null },
      });
    } catch (error) {
      await db.integrationConnection.update({
        where: { id: row.id },
        data: { status: "error", lastError: error instanceof Error ? error.message.slice(0, 400) : "Square token refresh failed." },
      });
      throw error;
    }
  }

  return fn({
    id: row.id,
    shopId,
    accessToken,
    merchantId: row.remoteTenantId,
    merchantName: row.remoteTenantName,
    settings: readSettings(row.settings),
  });
}

export async function disconnectSquare(shopId: string): Promise<void> {
  const row = await db.integrationConnection.findUnique({
    where: { shopId_provider: { shopId, provider: PROVIDER } },
  });
  if (!row) return;
  const applicationId = squareApplicationId();
  const applicationSecret = squareApplicationSecret();
  if (applicationId && applicationSecret && row.accessToken) {
    try {
      await fetch(`${squareOAuthBase()}/oauth2/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Client ${applicationSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: applicationId, access_token: row.accessToken }),
      });
    } catch {
      // Local disconnection still wins when Square is unreachable.
    }
  }
  await db.integrationConnection.update({
    where: { id: row.id },
    data: { status: "disconnected", accessToken: "", refreshToken: "", expiresAt: new Date(0), lastError: null },
  });
}
