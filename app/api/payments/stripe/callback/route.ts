import { NextResponse } from "next/server";

import { appUrl } from "@/lib/comms/config";
import { exchangeConnectCode, saveConnection, verifyConnectState } from "@/lib/payments";

/**
 * GET /api/payments/stripe/callback — step two of one-click onboarding.
 *
 * Stripe sends the owner's browser here with `?code=…&state=…`, or with
 * `?error=access_denied` if they changed their mind.
 *
 * THERE IS NO SESSION TO TRUST HERE — the request arrives as a top-level
 * navigation from another origin, and a cookie is not proof of intent for a
 * state-changing request that came from outside. The `state` parameter is the
 * proof: an HMAC over the shopId, signed by this server fifteen minutes ago,
 * verified before anything is read out of it (see lib/payments/connect.ts).
 * A callback with a missing, forged or expired state is dropped.
 *
 * Every exit is a redirect back to Settings → Payments carrying a short reason
 * code, which the tab turns into a sentence. Rendering an error page here
 * would strand the owner on a URL full of OAuth parameters.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function back(reason: string): NextResponse {
  const url = new URL("/settings", appUrl());
  url.searchParams.set("tab", "payments");
  url.searchParams.set("stripe", reason);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  if (params.get("error")) {
    // access_denied is the normal "no thanks" path, not a failure to report.
    return back(
      params.get("error") === "access_denied" ? "canceled" : "denied",
    );
  }

  const shopId = verifyConnectState(params.get("state"));
  if (!shopId) return back("bad-state");

  const code = params.get("code")?.trim();
  if (!code) return back("no-code");

  const exchange = await exchangeConnectCode(code);
  if (!exchange.ok) {
    console.error(`[payments] connect exchange failed: ${exchange.reason}`);
    return back("exchange-failed");
  }

  await saveConnection(shopId, exchange.accountId);
  console.log(
    `[payments] shop ${shopId} connected Stripe account ${exchange.accountId} (livemode=${exchange.livemode})`,
  );

  return back("connected");
}
