import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import http2 from "node:http2";

import { NATIVE_APP_ID } from "@/lib/native-app";

/**
 * Apple Push Notification service, token-based auth, no SDK.
 *
 * One HTTP/2 POST per device to /3/device/<token>, authorised by a short ES256
 * JWT signed with the team's .p8 key. Apple wants that JWT reused for between
 * 20 and 60 minutes, so it is cached for 50.
 *
 * Env (the first three, or iOS push is off — quietly):
 *   APNS_KEY_ID      the 10-character Key ID of the .p8 key
 *   APNS_TEAM_ID     the 10-character Apple Team ID
 *   APNS_KEY_P8      the .p8 file's contents (PEM; "\n" escapes are accepted)
 *   APNS_BUNDLE_ID   the topic; defaults to com.repairshelper.app
 *   APNS_ENV         "production" (default) or "sandbox" (Xcode debug builds)
 *   APNS_API_BASE    tests only: e.g. http://127.0.0.1:4330 (h2c)
 */

export type NativeMessage = { title: string; body: string; url: string };

/** ok; gone = the token is dead and must be forgotten; error = try again later. */
export type SendResult = { ok: true } | { ok: false; gone: boolean; reason: string };

type ApnsConfig = { keyId: string; teamId: string; key: KeyObject; topic: string; base: string };

let cachedConfig: { raw: string; config: ApnsConfig | null } | null = null;
let cachedJwt: { forKey: string; token: string; at: number } | null = null;

const JWT_TTL_MS = 50 * 60_000;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** The APNs settings, or null when any is missing or the key does not parse. */
export function apnsConfig(): ApnsConfig | null {
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const pem = env("APNS_KEY_P8").replace(/\\n/g, "\n");
  const topic = env("APNS_BUNDLE_ID") || NATIVE_APP_ID;
  const base =
    env("APNS_API_BASE").replace(/\/+$/, "") ||
    (env("APNS_ENV") === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
  const raw = [keyId, teamId, pem, topic, base].join("\u0000");
  if (cachedConfig?.raw === raw) return cachedConfig.config;

  let config: ApnsConfig | null = null;
  if (keyId && teamId && pem) {
    try {
      config = { keyId, teamId, key: createPrivateKey(pem), topic, base };
    } catch {
      config = null; // A mangled key: same as no key. Preflight says so.
    }
  }
  cachedConfig = { raw, config };
  return config;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** The provider token: ES256 over {alg, kid}.{iss, iat}. */
export function apnsJwt(config: ApnsConfig, now = Date.now()): string {
  const forKey = `${config.keyId}:${config.teamId}`;
  if (cachedJwt && cachedJwt.forKey === forKey && now - cachedJwt.at < JWT_TTL_MS) return cachedJwt.token;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: config.key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${header}.${claims}.${b64url(signature)}`;
  cachedJwt = { forKey, token, at: now };
  return token;
}

/** Forget cached settings and JWT (tests, or after rotating the key). */
export function resetApnsCache(): void {
  cachedConfig = null;
  cachedJwt = null;
}

/** The notification body. `url` sits at the top level, where the app reads `data.url`. */
export function apnsPayload(message: NativeMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    url: message.url,
  });
}

/** Reasons that mean this token will never work again. */
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "ExpiredToken"]);

export async function sendApns(token: string, message: NativeMessage, timeoutMs = 10_000): Promise<SendResult> {
  const config = apnsConfig();
  if (!config) return { ok: false, gone: false, reason: "not configured" };
  if (!/^[0-9a-fA-F]{32,200}$/.test(token)) return { ok: false, gone: true, reason: "BadDeviceToken" };

  const body = apnsPayload(message);
  return new Promise<SendResult>((resolve) => {
    let settled = false;
    const finish = (result: SendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      resolve(result);
    };

    const client = http2.connect(config.base);
    client.on("error", (error) => finish({ ok: false, gone: false, reason: error.message }));
    const timer = setTimeout(() => {
      client.destroy();
      finish({ ok: false, gone: false, reason: "timeout" });
    }, timeoutMs);

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsJwt(config)}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", (chunk: string) => {
      text += chunk;
    });
    request.on("end", () => {
      if (status === 200) return finish({ ok: true });
      let reason = `HTTP ${status}`;
      try {
        const parsed = JSON.parse(text) as { reason?: unknown };
        if (typeof parsed.reason === "string") reason = parsed.reason;
      } catch {
        // No JSON body: keep the status.
      }
      finish({ ok: false, gone: status === 410 || GONE_REASONS.has(reason), reason });
    });
    request.on("error", (error) => finish({ ok: false, gone: false, reason: error.message }));
    request.end(body);
  });
}
