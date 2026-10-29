import { NextResponse } from "next/server";

import { appOrigin } from "@/lib/comms/config";
import { openHandoff } from "@/lib/google/native-handoff";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/audit";

/**
 * GET /api/auth/native/complete?handoff=…&verifier=… — the last step of
 * Google sign-in inside the iOS / Android app.
 *
 * Opened by the app's WebView (components/native/native-bridge.tsx) after the
 * system browser tab hands control back. It turns the sealed handoff into the
 * same cookie the web flow would have set, in the WebView's own jar, and goes
 * on to where the sign-in was headed. See lib/google/native-handoff.ts for why
 * the verifier is required.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = appOrigin(request.url);

  const ip = await clientIp();
  if (!rateLimit(`native-handoff:${ip ?? "unknown"}`, 20, 15 * 60 * 1000).allowed) {
    return NextResponse.redirect(new URL("/login?google=rate-limited", origin));
  }

  const opened = await openHandoff(
    url.searchParams.get("handoff"),
    url.searchParams.get("verifier"),
  );
  if (!opened || opened.cookies.length === 0) {
    return NextResponse.redirect(new URL("/login?google=expired", origin));
  }

  const response = NextResponse.redirect(new URL(opened.next, origin));
  for (const cookie of opened.cookies) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: cookie.maxAge,
    });
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
