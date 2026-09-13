import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createSquareTerminalCheckout, inspectSquareTerminalCheckout } from "@/lib/payments/square";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireUser();
  if (session.role !== "OWNER" && session.role !== "FRONT_DESK") {
    return NextResponse.json({ error: "You cannot take payments." }, { status: 403, headers: HEADERS });
  }
  const body = await request.json().catch(() => null) as { invoiceId?: unknown; deviceId?: unknown } | null;
  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!invoiceId || !deviceId) {
    return NextResponse.json({ error: "Invoice and Square Terminal are required." }, { status: 400, headers: HEADERS });
  }
  const result = await createSquareTerminalCheckout({ shopId: session.shopId, invoiceId, deviceId });
  return result.ok
    ? NextResponse.json(result, { headers: HEADERS })
    : NextResponse.json({ error: result.reason }, { status: 400, headers: HEADERS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await requireUser();
  const checkoutId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!checkoutId) return NextResponse.json({ error: "Checkout id is required." }, { status: 400, headers: HEADERS });
  const result = await inspectSquareTerminalCheckout({
    shopId: session.shopId,
    checkoutId,
    takenById: session.userId,
  });
  return result.ok
    ? NextResponse.json(result, { headers: HEADERS })
    : NextResponse.json({ error: result.reason }, { status: 400, headers: HEADERS });
}
