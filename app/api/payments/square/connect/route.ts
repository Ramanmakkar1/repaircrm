import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/comms/config";
import { squareAuthorizeUrl, squareConfigured, squareConnectionStatus } from "@/lib/payments/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function back(reason: string): NextResponse {
  const url = new URL("/settings", appUrl());
  url.searchParams.set("tab", "payments");
  url.searchParams.set("square", reason);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<NextResponse> {
  const session = await requireUser();
  if (session.role !== "OWNER") return back("forbidden");
  if (!squareConfigured()) return back("unconfigured");
  const status = await squareConnectionStatus(session.shopId);
  if (status.connected) return back("already-connected");
  return NextResponse.redirect(await squareAuthorizeUrl(session.shopId), {
    headers: { "Cache-Control": "no-store" },
  });
}
