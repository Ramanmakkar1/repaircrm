import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { automaticPhotoSession } from "@/lib/inventory/automatic-photo-session";
import { automaticPhotoLookupKey } from "@/lib/inventory/automatic-product-photos";
import { productImageSource, PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const missing = () => new NextResponse("Not found", { status: 404, headers: HEADERS });
  const session = await automaticPhotoSession();
  if (!session) return missing();
  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, shopId: session.shopId },
    select: { name: true, category: true, catalogImage: true, attachments: PRODUCT_IMAGE_SELECT, automaticPhoto: true },
  });
  if (!product) return missing();
  const source = productImageSource({ name: product.name, category: product.category, catalogImage: product.catalogImage, imageUrl: product.attachments[0] ? `/files/${product.attachments[0].id}` : null });
  const row = product.automaticPhoto;
  if (source.src || row?.shopId !== session.shopId || row.status !== "ready" || row.lookupKey !== automaticPhotoLookupKey(product.name) || !row.path || !row.storage || !row.mimeType || !["image/jpeg", "image/png", "image/webp"].includes(row.mimeType)) return missing();
  const object = await readUpload(row.storage, row.path);
  if (!object) return missing();
  return new NextResponse(new Uint8Array(object.body), { headers: { ...HEADERS, "Content-Type": row.mimeType, "Content-Length": String(object.sizeBytes), "Content-Disposition": 'inline; filename="licensed-product-photo"' } });
}
