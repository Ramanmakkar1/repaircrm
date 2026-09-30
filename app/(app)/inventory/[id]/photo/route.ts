import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getSession, passwordVersion } from "@/lib/auth";
import { appOrigin } from "@/lib/comms/config";
import { db } from "@/lib/db";
import { PRODUCT_PHOTO_MAX_BYTES, validateProductPhoto } from "@/lib/inventory/product-images";
import { removeUpload, storeUpload } from "@/lib/storage";

export const runtime = "nodejs";
export type ProductPhotoResponse = { ok: true; imageUrl: string | null } | { ok: false; error: string };

function fail(error: string, status: number) {
  return NextResponse.json<ProductPhotoResponse>({ ok: false, error }, { status });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === appOrigin(request.url) || origin === new URL(request.url).origin;
}

function refreshProduct(id: string) {
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  revalidatePath(`/inventory/${id}/edit`);
  revalidatePath("/pos");
}

async function photoSession() {
  const session = await getSession();
  if (!session) return null;
  const account = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { active: true, passwordChangedAt: true, mustChangePassword: true },
  });
  if (!account?.active || account.mustChangePassword || (session.pv ?? 0) < passwordVersion(account.passwordChangedAt)) return null;
  return session;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail("This request must come from your shop workspace.", 403);
  const session = await photoSession();
  if (!session) return fail("Your session expired. Sign in again.", 401);
  const { id } = await params;
  const product = await db.product.findFirst({ where: { id, shopId: session.shopId }, select: { id: true } });
  if (!product) return fail("Product not found.", 404);

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > PRODUCT_PHOTO_MAX_BYTES + 64 * 1024) return fail("Choose a photo smaller than 5 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("That photo did not arrive. Try again.", 400); }
  const file = form.get("photo");
  if (!(file instanceof File)) return fail("Choose a product photo first.", 400);
  const error = await validateProductPhoto(file);
  if (error) return fail(error, 400);

  const previous = await db.attachment.findMany({
    where: { shopId: session.shopId, productId: id, mimeType: { startsWith: "image/" } },
    select: { id: true, storage: true, path: true },
  });
  const stored = await storeUpload(session.shopId, file);
  if (!stored.ok) return fail(stored.reason, 503);
  let attachment: { id: string };
  try {
    attachment = await db.$transaction(async (tx) => {
      // Recheck ownership inside the write transaction, including deletion races.
      const owned = await tx.product.findFirst({ where: { id, shopId: session.shopId }, select: { id: true } });
      if (!owned) throw new Error("Product no longer exists.");
      const created = await tx.attachment.create({
        data: { ...stored.upload, shopId: session.shopId, productId: id, uploadedById: session.userId },
        select: { id: true },
      });
      if (previous.length) await tx.attachment.deleteMany({ where: { shopId: session.shopId, productId: id, id: { in: previous.map((photo) => photo.id) } } });
      return created;
    });
  } catch (error) {
    await removeUpload(stored.upload.storage, stored.upload.path);
    console.error("[product-photo] save failed:", error);
    return fail("Could not save that photo. Try again.", 500);
  }
  await Promise.all(previous.map((photo) => removeUpload(photo.storage, photo.path)));
  refreshProduct(id);
  return NextResponse.json<ProductPhotoResponse>({ ok: true, imageUrl: `/files/${attachment.id}` });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail("This request must come from your shop workspace.", 403);
  const session = await photoSession();
  if (!session) return fail("Your session expired. Sign in again.", 401);
  const { id } = await params;
  const owned = await db.product.findFirst({ where: { id, shopId: session.shopId }, select: { id: true } });
  if (!owned) return fail("Product not found.", 404);
  const photos = await db.attachment.findMany({ where: { shopId: session.shopId, productId: id, mimeType: { startsWith: "image/" } }, select: { id: true, storage: true, path: true } });
  await db.attachment.deleteMany({ where: { shopId: session.shopId, productId: id, id: { in: photos.map((photo) => photo.id) } } });
  await Promise.all(photos.map((photo) => removeUpload(photo.storage, photo.path)));
  refreshProduct(id);
  return NextResponse.json<ProductPhotoResponse>({ ok: true, imageUrl: null });
}
