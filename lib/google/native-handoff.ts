import { EncryptJWT, jwtDecrypt } from "jose";

import { NATIVE_URL_SCHEME } from "@/lib/native-app";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

import { safeNextPath } from "./oidc";

/**
 * Google sign-in from inside the iOS / Android app.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Google refuses OAuth inside an embedded WebView (`disallowed_useragent`), so
 * the app runs the ordinary web flow in the system browser tab
 * (SFSafariViewController / Chrome Custom Tab) instead. That tab has its own
 * cookie jar: the session the callback mints lands there, not in the app's
 * WebView. This file carries it across, once.
 *
 *   1. The app makes a random `verifier` and keeps it. It opens
 *      /api/auth/google/start?…&native=<S256(verifier)> in the browser tab.
 *   2. The challenge rides inside the signed `state` through Google.
 *   3. The callback signs the person in as usual, then — instead of leaving the
 *      cookie in the tab — seals it into a HANDOFF: an encrypted (A256GCM) JWT,
 *      two minutes long, bound to the challenge. It sends the tab to
 *      `com.repairshelper.app://google-auth?handoff=…`, which brings the app
 *      back to the front.
 *   4. The app's WebView opens /api/auth/native/complete?handoff=…&verifier=…;
 *      the server checks S256(verifier) === challenge and sets the cookie in
 *      the WebView.
 *
 * WHAT IT PROTECTS AGAINST: another app registering the same URL scheme (the
 * classic interception on Android) gets the handoff but not the verifier, which
 * never left our app. The handoff is encrypted, so it cannot simply read the
 * session token out of it either. Stolen within two minutes it is useless;
 * after two minutes it is useless to everyone.
 * ---------------------------------------------------------------------------
 */

const HANDOFF_KIND = "native-handoff";
const HANDOFF_TTL_S = 120;

/** Path the custom-scheme URL uses: `com.repairshelper.app://google-auth`. */
export const NATIVE_RETURN_HOST = "google-auth";

/**
 * The only cookies a handoff may carry. The pending-2FA cookie's name is
 * spelled out rather than imported so this module stays free of next/headers.
 */
export const HANDOFF_COOKIES = [SESSION_COOKIE, "rf_2fa"] as const;

export type HandoffCookie = { name: string; value: string; maxAge: number };

/** RFC 7636: a S256 challenge is 43 base64url characters. */
export function validChallenge(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw);
}

/** RFC 7636: a verifier is 43–128 characters of the unreserved set. */
function validVerifier(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(raw);
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(new Uint8Array(digest)).toString("base64url");
}

/**
 * A 256-bit encryption key derived from AUTH_SECRET. Derived rather than the
 * raw secret so it can never be the same bytes that sign sessions.
 */
async function handoffKey(): Promise<Uint8Array> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`repairs-helper/native-handoff/v1\0${secret}`),
  );
  return new Uint8Array(digest);
}

export async function sealHandoff(input: {
  challenge: string;
  cookies: HandoffCookie[];
  next: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({
    kind: HANDOFF_KIND,
    challenge: input.challenge,
    cookies: input.cookies.filter((c) =>
      (HANDOFF_COOKIES as readonly string[]).includes(c.name),
    ),
    next: safeNextPath(input.next),
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + HANDOFF_TTL_S)
    .encrypt(await handoffKey());
}

/** Null for anything wrong: expired, tampered, wrong verifier, wrong shape. */
export async function openHandoff(
  token: string | null | undefined,
  verifier: string | null | undefined,
): Promise<{ cookies: HandoffCookie[]; next: string } | null> {
  if (!token || !validVerifier(verifier)) return null;
  try {
    const { payload } = await jwtDecrypt(token, await handoffKey());
    if (payload.kind !== HANDOFF_KIND) return null;
    if (typeof payload.challenge !== "string") return null;
    if ((await s256(verifier)) !== payload.challenge) return null;

    const raw = Array.isArray(payload.cookies) ? payload.cookies : [];
    const cookies: HandoffCookie[] = [];
    for (const c of raw as Record<string, unknown>[]) {
      if (
        typeof c?.name === "string" &&
        typeof c.value === "string" &&
        typeof c.maxAge === "number" &&
        (HANDOFF_COOKIES as readonly string[]).includes(c.name)
      ) {
        cookies.push({
          name: c.name,
          value: c.value,
          maxAge: Math.max(0, Math.min(c.maxAge, SESSION_MAX_AGE)),
        });
      }
    }
    return {
      cookies,
      next: safeNextPath(typeof payload.next === "string" ? payload.next : null),
    };
  } catch {
    return null;
  }
}

/** The custom-scheme URL that hands control back to the app. */
export function nativeReturnUrl(params: { handoff?: string; next: string }): string {
  const query = new URLSearchParams();
  if (params.handoff) query.set("handoff", params.handoff);
  query.set("next", safeNextPath(params.next));
  return `${NATIVE_URL_SCHEME}://${NATIVE_RETURN_HOST}?${query.toString()}`;
}

/**
 * The page the browser tab shows at the end of the flow. A server redirect to
 * a custom scheme is not reliably followed by SFSafariViewController, so this
 * tries it from script and also offers a real button — a tap always works.
 */
export function nativeReturnPage(url: string): Response {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Back to Repairs helper</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.5 system-ui,-apple-system,sans-serif;background:#fff;color:#111}
@media (prefers-color-scheme:dark){body{background:#0b0c0e;color:#eee}}
main{padding:24px;text-align:center;max-width:360px}
a{display:inline-block;margin-top:16px;padding:14px 22px;border-radius:12px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600}
</style></head>
<body><main>
<p>Returning to the Repairs helper app…</p>
<a href="${href}">Open Repairs helper</a>
</main>
<script>location.replace(${JSON.stringify(url).replace(/</g, "\\u003c")});</script>
</body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
