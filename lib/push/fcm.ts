import { createPrivateKey, sign, type KeyObject } from "node:crypto";

import type { NativeMessage, SendResult } from "./apns";

/**
 * Firebase Cloud Messaging HTTP v1 for the Android app, no SDK.
 *
 * Auth is the OAuth2 JWT-bearer flow for a service account: an RS256 JWT
 * signed with the account's private key is swapped at Google's token endpoint
 * for an access token (1 hour), which is cached until shortly before expiry.
 *
 * Env:
 *   FCM_SERVICE_ACCOUNT_JSON  the service-account key file's JSON (Firebase
 *                             console → Project settings → Service accounts).
 *                             Missing or unparsable = Android push is off, quietly.
 *   FCM_API_BASE              tests only (default https://fcm.googleapis.com)
 *   FCM_TOKEN_URL             tests only (default: the key's token_uri)
 */

type FcmConfig = {
  projectId: string;
  clientEmail: string;
  key: KeyObject;
  tokenUrl: string;
  apiBase: string;
};

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let cachedConfig: { raw: string; config: FcmConfig | null } | null = null;
let cachedAccess: { forKey: string; token: string; expiresAt: number } | null = null;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function fcmConfig(): FcmConfig | null {
  const json = env("FCM_SERVICE_ACCOUNT_JSON");
  const raw = [json, env("FCM_API_BASE"), env("FCM_TOKEN_URL")].join("\u0000");
  if (cachedConfig?.raw === raw) return cachedConfig.config;

  let config: FcmConfig | null = null;
  if (json) {
    try {
      const account = JSON.parse(json) as Record<string, unknown>;
      const projectId = account.project_id;
      const clientEmail = account.client_email;
      const pem = account.private_key;
      if (typeof projectId === "string" && typeof clientEmail === "string" && typeof pem === "string") {
        config = {
          projectId,
          clientEmail,
          key: createPrivateKey(pem.replace(/\\n/g, "\n")),
          tokenUrl:
            env("FCM_TOKEN_URL") ||
            (typeof account.token_uri === "string" ? account.token_uri : "") ||
            "https://oauth2.googleapis.com/token",
          apiBase: (env("FCM_API_BASE") || "https://fcm.googleapis.com").replace(/\/+$/, ""),
        };
      }
    } catch {
      config = null;
    }
  }
  cachedConfig = { raw, config };
  return config;
}

export function resetFcmCache(): void {
  cachedConfig = null;
  cachedAccess = null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** The signed assertion for the token endpoint. */
export function fcmAssertion(config: FcmConfig, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: config.tokenUrl, iat, exp: iat + 3600 }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), config.key);
  return `${header}.${claims}.${b64url(signature)}`;
}

async function accessToken(config: FcmConfig, timeoutMs: number): Promise<string> {
  const forKey = `${config.clientEmail}:${config.tokenUrl}`;
  if (cachedAccess && cachedAccess.forKey === forKey && Date.now() < cachedAccess.expiresAt) {
    return cachedAccess.token;
  }
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: fcmAssertion(config),
    }).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!response.ok || typeof data?.access_token !== "string") {
    throw new Error(`FCM auth failed (HTTP ${response.status})`);
  }
  const lifetime = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cachedAccess = { forKey, token: data.access_token, expiresAt: Date.now() + Math.max(60, lifetime - 120) * 1000 };
  return data.access_token;
}

/** The Android notification channel the app creates (components/native/native-push.tsx). */
export const ANDROID_CHANNEL_ID = "shop";

export function fcmBody(token: string, message: NativeMessage) {
  return {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: { url: message.url },
      android: { priority: "HIGH", ttl: "3600s", notification: { channel_id: ANDROID_CHANNEL_ID } },
    },
  };
}

export async function sendFcm(token: string, message: NativeMessage, timeoutMs = 10_000): Promise<SendResult> {
  const config = fcmConfig();
  if (!config) return { ok: false, gone: false, reason: "not configured" };

  let bearer: string;
  try {
    bearer = await accessToken(config, timeoutMs);
  } catch (error) {
    return { ok: false, gone: false, reason: error instanceof Error ? error.message : "FCM auth failed" };
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify(fcmBody(token, message)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, gone: false, reason: error instanceof Error ? error.message : "network error" };
  }
  if (response.ok) return { ok: true };

  if (response.status === 401) cachedAccess = null; // Revoked or rotated: fetch a new one next time.
  const data = (await response.json().catch(() => null)) as {
    error?: { status?: string; details?: { errorCode?: string }[] };
  } | null;
  const codes = [data?.error?.status, ...(data?.error?.details ?? []).map((d) => d.errorCode)].filter(
    (c): c is string => typeof c === "string",
  );
  const gone = codes.includes("UNREGISTERED") || (response.status === 404 && codes.includes("NOT_FOUND"));
  return { ok: false, gone, reason: codes[codes.length - 1] ?? `HTTP ${response.status}` };
}
