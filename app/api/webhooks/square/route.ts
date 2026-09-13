import { NextResponse } from "next/server";

import { applySquareWebhook, verifySquareSignature } from "@/lib/payments/square/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  if (!verifySquareSignature({
    body,
    signature: request.headers.get("x-square-hmacsha256-signature"),
  })) {
    return NextResponse.json({ error: "Invalid Square signature." }, { status: 401 });
  }
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const result = await applySquareWebhook(event as never);
  if (result.status === "error") {
    console.error("[payments] Square webhook failed:", result.reason);
    return NextResponse.json({ error: "Settlement failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: result.status });
}
