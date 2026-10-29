import { NextResponse } from "next/server";

import { appOrigin } from "@/lib/comms/config";
import { BROWSER_SESSION_MAX_AGE, openBrowserPass } from "@/lib/native/browser-pass";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * GET /api/auth/native/browser?pass=… — opened in the system browser tab by
 * the iOS / Android app. Sets a 15-minute session cookie scoped to the one
 * path the pass names, then goes there. See lib/native/browser-pass.ts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = appOrigin(request.url);
  const opened = await openBrowserPass(url.searchParams.get("pass"));
  if (!opened) {
    return new NextResponse(
      "This link has expired. Go back to the Repairs helper app and tap the download again.",
      { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.redirect(new URL(opened.target, origin));
  response.cookies.set(SESSION_COOKIE, opened.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: opened.pathname,
    maxAge: BROWSER_SESSION_MAX_AGE,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
