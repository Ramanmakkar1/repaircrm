import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { attentionItems, attentionTotal } from "@/components/counter/attention";
import { loadAttentionCounts } from "@/components/counter/attention-data";
import { increasedCounts } from "@/lib/push/validation";
import { sendPush } from "@/lib/push/send";
export async function runStaffPushForShop(shopId: string) {
 const devices = await db.pushSubscription.findMany({where: {shopId}, include: {user: {select: {active: true, role: true, defaultLocationId: true}}}});
 if (!devices.length) return;
 const shop = await db.shop.findUnique({where: {id: shopId}, select: {pushPublicKey: true, pushPrivateKey: true}});
 if (!shop?.pushPublicKey || !shop.pushPrivateKey) return;
 const memo = new Map<string, Awaited<ReturnType<typeof loadAttentionCounts>>>();
 for (const device of devices) {
  if (!device.user.active) {await db.pushSubscription.deleteMany({where: {id: device.id, shopId}}); continue;}
  const branch = device.user.defaultLocationId ? {locationId: device.user.defaultLocationId} : {};
  const key = `${device.user.role}:${branch.locationId ?? "all"}`;
  const counts = memo.get(key) ?? await loadAttentionCounts({shopId, role: device.user.role}, branch); memo.set(key, counts);
  const items = attentionItems(counts, device.user.role);
  const current = Object.fromEntries(items.map(i => [i.key, i.count]));
  if (JSON.stringify(current) === JSON.stringify(device.lastCounts)) continue;
  const claimedAt = new Date();
  const claim = await db.pushSubscription.updateMany({where: {id: device.id, shopId, updatedAt: device.updatedAt}, data: {lastCounts: current, updatedAt: claimedAt}});
  if (!claim.count || !increasedCounts(current, device.lastCounts)) continue;
  try {await sendPush(device, {publicKey: shop.pushPublicKey, privateKey: shop.pushPrivateKey}, {title: "Repairs helper · Needs you", body: `${attentionTotal(items)} things need attention. Open the app to see what’s waiting.`, url: "/"});}
  catch(error) {
   const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : null;
   if (status === 404 || status === 410) await db.pushSubscription.deleteMany({where: {id: device.id, shopId}});
   else {await db.pushSubscription.updateMany({where: {id: device.id, shopId, updatedAt: claimedAt}, data: {lastCounts: device.lastCounts ?? Prisma.DbNull}}); throw new Error("Phone notification delivery failed; it will retry next run.");}
  }
 }
}
