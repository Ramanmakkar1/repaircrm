import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/config";
import {
  GOOGLE_FLOW_COOKIE,
  flowCookieOptions,
  parseIntent,
  safeNextPath,
  startFlow,
} from "@/lib/google/oidc";

/**
 * GET /api/auth/google/start — step one of the sign-in.
 *
 * Mints the PKCE pair, the nonce and the signed `state`, drops the flow cookie
 * and sends the browser to Google. Nothing is written to the database here:
 * until Google hands back a code and the callback verifies the id_token, this
 * route has learned nothing about anybody.
 *
 * STAFF ONLY. The customer portal signs people in with the magic links in
 * lib/comms/config.ts and is not touched by any of this.
 *
 *   ?intent=signin | signup | link | invite:<token>   (default: signin)
 *   ?next=/some/path                                  (same-origin paths only)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = url.origin;

  const back = (path: string, code: string) => {
    const target = new URL(path, origin);
    target.searchParams.set("google", code);
    return NextResponse.redirect(target);
  };

  // Fail closed. With no client credentials the button does not render
  // anywhere, so reaching this by hand is the only way here — and it gets a
  // sentence rather than a redirect loop through a Google that has never
  // heard of this app.
  if (!googleConfigured()) return back("/login", "not-configured");

  const intent = parseIntent(url.searchParams.get("intent"));
  if (!intent) return back("/login", "bad-request");

  // Connecting an account to a profile needs a profile to connect it to. The
  // callback re-checks the session; this is just so the person is not sent all
  // the way to Google to find that out.
  if (intent.kind === "link") {
    const session = await getSession();
    if (!session) return back("/login", "signed-out");
  }

  const next =
    intent.kind === "link"
      ? "/settings?tab=profile"
      : safeNextPath(url.searchParams.get("next"));

  const flow = await startFlow({ intent, next });

  const response = NextResponse.redirect(flow.authorizeUrl);
  response.cookies.set(GOOGLE_FLOW_COOKIE, flow.flowToken, flowCookieOptions());
  return response;
}
