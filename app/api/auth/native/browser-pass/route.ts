import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { sealBrowserPass } from "@/lib/native/browser-pass";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/native/browser-pass {path} — the iOS / Android app asking to
 * open a download or print view in the system browser tab, signed in for that
 * one path only. See lib/native/browser-pass.ts.
 *
 * JSON only, like /api/push/native: a cross-site form cannot send it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!rateLimit(`browser-pass:${session.userId}`, 30, 60_000).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const pass = await sealBrowserPass(session, typeof body?.path === "string" ? body.path : "");
  if (!pass) return NextResponse.json({ ok: false }, { status: 400 });

  const response = NextResponse.json({
    ok: true,
    url: `/api/auth/native/browser?${new URLSearchParams({ pass }).toString()}`,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
