import { db } from "@/lib/db";
import { readUpload } from "@/lib/storage";
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
 const {id} = await params;
 const shop = await db.shop.findUnique({where: {id}, select: {logoPath: true, logoStorage: true}});
 if (!shop?.logoPath) return new Response(null, {status: 404});
 const image = await readUpload(shop.logoStorage ?? "local", shop.logoPath);
 if (!image) return new Response(null, {status: 404});
 return new Response(new Uint8Array(image.body), {headers: {"Content-Type": "image/png", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"}});
}
