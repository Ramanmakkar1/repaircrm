import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NATIVE_PUSH_COOKIE } from "@/lib/push/device";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/push/native — the iOS / Android app registering this phone for
 * native push (components/native/native-push.tsx).
 *
 * The staff "needs attention" job (lib/jobs/push.ts) sends to these rows
 * through APNs / FCM (lib/push/native.ts) once their env is set. The row id
 * goes in a cookie so sign-out forgets this phone (lib/push/device.ts).
 *
 * JSON only: a cross-site form cannot send `application/json` without a CORS
 * preflight this route never answers, and the session cookie is `lax`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  platform: z.enum(["ios", "android"]),
  // APNs tokens are 64 hex characters; FCM tokens are ~150–250 URL-safe characters.
  token: z.string().min(32).max(4096).regex(/^[A-Za-z0-9:_\-.]+$/),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!rateLimit(`native-push:${session.userId}`, 10, 60_000).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { platform, token } = parsed.data;
  // A phone handed to a colleague re-registers under them; the token moves.
  const existing = await db.nativePushDevice.findUnique({ where: { token }, select: { userId: true } });
  const row = await db.nativePushDevice.upsert({
    where: { token },
    create: { shopId: session.shopId, userId: session.userId, platform, token },
    update: {
      shopId: session.shopId,
      userId: session.userId,
      platform,
      // A new person on this phone starts from zero, not the last one's counts.
      ...(existing && existing.userId !== session.userId ? { lastCounts: {} } : {}),
    },
    select: { id: true },
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(NATIVE_PUSH_COOKIE, row.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return response;
}
