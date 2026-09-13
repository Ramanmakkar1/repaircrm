import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { verifySquarePosTerminalCheckout } from "@/lib/payments/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await requireUser();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Checkout id is required." }, { status: 400 });
  const result = await verifySquarePosTerminalCheckout({ shopId: session.shopId, checkoutId: id });
  return result.ok
    ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.reason }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
