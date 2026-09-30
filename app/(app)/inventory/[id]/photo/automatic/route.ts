import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { automaticPhotoSameOrigin, automaticPhotoSession } from "@/lib/inventory/automatic-photo-session";
import { dismissAutomaticProductPhoto, getAutomaticProductPhoto } from "@/lib/inventory/automatic-product-photos";

export const runtime = "nodejs";
type Authorized = { ok: false; response: NextResponse } | { ok: true; session: NonNullable<Awaited<ReturnType<typeof automaticPhotoSession>>>; id: string; headers: Record<string, string> };

async function authorized(request: Request, params: Promise<{ id: string }>): Promise<Authorized> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!automaticPhotoSameOrigin(request)) return { ok: false, response: NextResponse.json({ ok: false, error: "This request must come from your shop workspace." }, { status: 403, headers }) };
  const session = await automaticPhotoSession();
  if (!session) return { ok: false, response: NextResponse.json({ ok: false, error: "Your session expired. Sign in again." }, { status: 401, headers }) };
  const { id } = await params;
  const product = await db.product.findFirst({ where: { id, shopId: session.shopId }, select: { id: true } });
  if (!product) return { ok: false, response: NextResponse.json({ ok: false, error: "Product not found." }, { status: 404, headers }) };
  return { ok: true, session, id, headers };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized(request, params);
  if (!auth.ok) return auth.response;
  // No user-provided query or URL is accepted; only the tenant-owned catalogue name is used.
  return NextResponse.json(await getAutomaticProductPhoto(auth.id, auth.session), { headers: auth.headers });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized(request, params);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await dismissAutomaticProductPhoto(auth.id, auth.session.shopId), { headers: auth.headers });
}
