import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/push/native — the iOS / Android app registering this phone for
 * native push (components/native/native-push.tsx).
 *
 * Only the registration is wired. Sending needs the APNs key and the Firebase
 * project, which the owner has to create (mobile/README.md → Push). Until then
 * the rows simply wait.
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
  await db.nativePushDevice.upsert({
    where: { token },
    create: { shopId: session.shopId, userId: session.userId, platform, token },
    update: { shopId: session.shopId, userId: session.userId, platform },
  });
  return NextResponse.json({ ok: true });
}
