import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeDriver, removeUpload } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(request: Request) {
 const {shopId} = await requireRole("OWNER");
 if (Number(request.headers.get("content-length")) > 3 * 1024 * 1024) return NextResponse.json({error: "Choose a picture under 2 MB."}, {status: 413});
 const data = await request.formData().catch(() => null);
 const file = data?.get("logo");
 if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) return NextResponse.json({error: "Choose a PNG, JPEG or WebP picture under 2 MB."}, {status: 400});
 let body: Buffer;
 try {
   const image = sharp(Buffer.from(await file.arrayBuffer()), {limitInputPixels: 20_000_000});
   const metadata = await image.metadata();
   if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported picture");
   body = await image.rotate().resize(512, 512, {fit: "inside", withoutEnlargement: true}).png().toBuffer();
 } catch {return NextResponse.json({error: "That file is not a readable PNG, JPEG or WebP picture."}, {status: 400});}
 const old = await db.shop.findUnique({where: {id: shopId}, select: {logoPath: true, logoStorage: true}});
 const driver = activeDriver(); let path: string | null = null;
 try {
  path = await driver.put({key: `${shopId}/${randomBytes(16).toString("hex")}.png`, body, contentType: "image/png"});
  await db.shop.update({where: {id: shopId}, data: {logoPath: path, logoStorage: driver.name, logoUrl: `/shop-logo/${shopId}`}});
 } catch {
  if (path) await removeUpload(driver.name, path);
  return NextResponse.json({error: "The logo could not be saved. Try again."}, {status: 503});
 }
 if (old?.logoPath) await removeUpload(old.logoStorage ?? "local", old.logoPath);
 revalidatePath("/", "layout");
 return NextResponse.json({ok: true, url: `/shop-logo/${shopId}`});
}
export async function DELETE() {
 const {shopId} = await requireRole("OWNER");
 const old = await db.shop.findUnique({where: {id: shopId}, select: {logoPath: true, logoStorage: true}});
 const result = await db.shop.updateMany({where: {id: shopId, logoPath: old?.logoPath ?? null}, data: {logoUrl: null, logoPath: null, logoStorage: null}});
 if (!result.count) return NextResponse.json({error: "The logo changed. Refresh and try again."}, {status: 409});
 if (old?.logoPath) await removeUpload(old.logoStorage ?? "local", old.logoPath);
 revalidatePath("/", "layout");
 return NextResponse.json({ok: true});
}
