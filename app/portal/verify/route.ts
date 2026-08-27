import { NextResponse, type NextRequest } from "next/server";

import {
  PORTAL_COOKIE,
  consumePortalToken,
  portalCookieOptions,
  safeNextPath,
  signPortalSession,
} from "@/lib/portal-session";

/**
 * Exchanges a magic-link token for the portal cookie.
 *
 * This is a Route Handler and not a page because Next.js forbids mutating
 * cookies during a render — the entry page hands `?token=` here, and this is
 * the only place `rf_portal` is ever minted.
 *
 * The cookie is written onto the redirect response directly rather than through
 * `cookies().set()`, so the Set-Cookie header and the 302 are unambiguously the
 * same response.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  const session = await consumePortalToken(token);

  if (!session) {
    const failed = new URL("/portal", request.nextUrl.origin);
    failed.searchParams.set("error", token ? "expired" : "invalid");
    if (next) failed.searchParams.set("next", next);
    return NextResponse.redirect(failed);
  }

  const destination = new URL(next ?? "/portal/home", request.nextUrl.origin);
  const response = NextResponse.redirect(destination);
  response.cookies.set(
    PORTAL_COOKIE,
    await signPortalSession(session),
    portalCookieOptions(),
  );
  return response;
}
