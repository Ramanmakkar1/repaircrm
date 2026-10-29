import { EncryptJWT, jwtDecrypt } from "jose";

import { opensInSystemBrowser } from "@/lib/native-app";
import { signSession, type SessionUser } from "@/lib/session";

/**
 * Downloads and printing from inside the iOS / Android app.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The Android WebView does nothing with a download (a CSV export, a PDF
 * attachment), and neither WebView implements window.print(). On iOS a
 * target=_blank link leaves for Safari, which is signed out. The system
 * browser tab the app already uses for Google sign-in (Chrome Custom Tab /
 * SFSafariViewController) downloads, previews and prints properly — but it has
 * its own cookie jar.
 *
 * So the app asks for a PASS for one path (POST /api/auth/native/browser-pass)
 * and opens /api/auth/native/browser?pass=… in the tab. That route sets a
 * session cookie that is:
 *   · a NEW token that itself expires in 15 minutes (not the app's 7-day one);
 *   · scoped to exactly that one path (Path=/api/exports/invoices.csv), so the
 *     browser sends it nowhere else on the site;
 * and redirects to the path. Only paths in NATIVE_BROWSER_PATHS qualify.
 *
 * The pass itself is encrypted (A256GCM, key derived from AUTH_SECRET), lasts
 * 60 seconds and is accepted once per server process. It never crosses an OS
 * URL-scheme hop: the app hands it straight to the browser tab.
 * ---------------------------------------------------------------------------
 */

const PASS_KIND = "native-browser-pass";
const PASS_TTL_S = 60;
/** Lifetime of the token and cookie the browser tab gets. */
export const BROWSER_SESSION_MAX_AGE = 15 * 60;

async function passKey(): Promise<Uint8Array> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`repairs-helper/native-browser-pass/v1\0${secret}`),
  );
  return new Uint8Array(digest);
}

/** A same-site path + query the app may open in the browser, or null. */
export function browserTarget(raw: unknown): { pathname: string; target: string } | null {
  if (typeof raw !== "string" || raw.length > 2048 || !raw.startsWith("/") || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://app.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://app.invalid" || !opensInSystemBrowser(url.pathname)) return null;
  return { pathname: url.pathname, target: `${url.pathname}${url.search}` };
}

export async function sealBrowserPass(session: SessionUser, path: string): Promise<string | null> {
  const target = browserTarget(path);
  if (!target) return null;
  const token = await signSession(session, BROWSER_SESSION_MAX_AGE);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({ kind: PASS_KIND, token, target: target.target })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + PASS_TTL_S)
    .encrypt(await passKey());
}

const spent = new Map<string, number>();

/** The session token and target for a valid, unused pass; null otherwise. */
export async function openBrowserPass(
  pass: string | null | undefined,
): Promise<{ token: string; pathname: string; target: string } | null> {
  if (!pass || pass.length > 8192) return null;
  try {
    const { payload } = await jwtDecrypt(pass, await passKey());
    if (payload.kind !== PASS_KIND || typeof payload.token !== "string" || typeof payload.jti !== "string") return null;
    const target = browserTarget(payload.target);
    if (!target) return null;

    const now = Date.now();
    for (const [id, until] of spent) if (until < now) spent.delete(id);
    if (spent.has(payload.jti)) return null;
    spent.set(payload.jti, now + (PASS_TTL_S + 5) * 1000);

    return { token: payload.token, ...target };
  } catch {
    return null;
  }
}
