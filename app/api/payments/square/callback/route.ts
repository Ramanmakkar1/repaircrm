import { NextResponse } from "next/server";

import { appUrl } from "@/lib/comms/config";
import { connectSquare, verifySquareState } from "@/lib/payments/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function back(reason: string): NextResponse {
  const url = new URL("/settings", appUrl());
  url.searchParams.set("tab", "payments");
  url.searchParams.set("square", reason);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  if (params.get("error")) {
    return back(params.get("error") === "access_denied" ? "canceled" : "denied");
  }
  const shopId = await verifySquareState(params.get("state"));
  if (!shopId) return back("bad-state");
  const code = params.get("code")?.trim();
  if (!code) return back("no-code");
  try {
    await connectSquare(shopId, code);
    return back("connected");
  } catch (error) {
    console.error("[payments] Square OAuth callback failed:", error);
    return back("exchange-failed");
  }
}
