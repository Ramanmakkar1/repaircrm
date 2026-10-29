import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { attentionItems, attentionTotal } from "@/components/counter/attention";
import { loadAttentionCounts } from "@/components/counter/attention-data";
import { increasedCounts } from "@/lib/push/validation";
import { sendPush } from "@/lib/push/send";
import { nativePushPlatforms, sendNativePush } from "@/lib/push/native";
type Staff = {active: boolean; role: string; defaultLocationId: string | null};
const staffSelect = {select: {active: true, role: true, defaultLocationId: true}} as const;
/** The same "needs attention" digest goes to browsers (web push) and to the iOS / Android app (APNs / FCM). */
export async function runStaffPushForShop(shopId: string) {
 const memo = new Map<string, Awaited<ReturnType<typeof loadAttentionCounts>>>();
 const itemsFor = async (user: Staff) => {
  const branch = user.defaultLocationId ? {locationId: user.defaultLocationId} : {};
  const key = `${user.role}:${branch.locationId ?? "all"}`;
  const counts = memo.get(key) ?? await loadAttentionCounts({shopId, role: user.role}, branch); memo.set(key, counts);
  return attentionItems(counts, user.role);
 };
 const message = (items: ReturnType<typeof attentionItems>) => ({title: "Repairs helper · Needs you", body: `${attentionTotal(items)} things need attention. Open the app to see what’s waiting.`, url: "/"});
 const failures: string[] = [];
 try {await runWebPush(shopId, itemsFor, message);} catch (error) {failures.push(`browser: ${error instanceof Error ? error.message : String(error)}`);}
 try {await runNativePush(shopId, itemsFor, message);} catch (error) {failures.push(`app: ${error instanceof Error ? error.message : String(error)}`);}
 if (failures.length) throw new Error(`Phone notification delivery failed (${failures.join("; ")}); it will retry next run.`);
}
type ItemsFor = (user: Staff) => Promise<ReturnType<typeof attentionItems>>;
type MessageFor = (items: ReturnType<typeof attentionItems>) => {title: string; body: string; url: string};
async function runWebPush(shopId: string, itemsFor: ItemsFor, message: MessageFor) {
 const devices = await db.pushSubscription.findMany({where: {shopId}, include: {user: staffSelect}});
 if (!devices.length) return;
 const shop = await db.shop.findUnique({where: {id: shopId}, select: {pushPublicKey: true, pushPrivateKey: true}});
 if (!shop?.pushPublicKey || !shop.pushPrivateKey) return;
 let failed = false;
 for (const device of devices) {
  if (!device.user.active) {await db.pushSubscription.deleteMany({where: {id: device.id, shopId}}); continue;}
  const items = await itemsFor(device.user);
  const current = Object.fromEntries(items.map(i => [i.key, i.count]));
  if (JSON.stringify(current) === JSON.stringify(device.lastCounts)) continue;
  const claimedAt = new Date();
  const claim = await db.pushSubscription.updateMany({where: {id: device.id, shopId, updatedAt: device.updatedAt}, data: {lastCounts: current, updatedAt: claimedAt}});
  if (!claim.count || !increasedCounts(current, device.lastCounts)) continue;
  try {await sendPush(device, {publicKey: shop.pushPublicKey, privateKey: shop.pushPrivateKey}, message(items));}
  catch(error) {
   const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : null;
   if (status === 404 || status === 410) await db.pushSubscription.deleteMany({where: {id: device.id, shopId}});
   else {await db.pushSubscription.updateMany({where: {id: device.id, shopId, updatedAt: claimedAt}, data: {lastCounts: device.lastCounts ?? Prisma.DbNull}}); failed = true;}
  }
 }
 if (failed) throw new Error("web push delivery failed");
}
async function runNativePush(shopId: string, itemsFor: ItemsFor, message: MessageFor) {
 const platforms = nativePushPlatforms();
 if (!platforms.length) return; // No APNs / FCM credentials: native push is off, quietly.
 const devices = await db.nativePushDevice.findMany({where: {shopId, platform: {in: platforms}}, include: {user: staffSelect}});
 const reasons = new Set<string>();
 for (const device of devices) {
  if (!device.user.active) {await db.nativePushDevice.deleteMany({where: {id: device.id, shopId}}); continue;}
  const items = await itemsFor(device.user);
  const current = Object.fromEntries(items.map(i => [i.key, i.count]));
  if (JSON.stringify(current) === JSON.stringify(device.lastCounts)) continue;
  const claimedAt = new Date();
  const claim = await db.nativePushDevice.updateMany({where: {id: device.id, shopId, updatedAt: device.updatedAt}, data: {lastCounts: current, updatedAt: claimedAt}});
  if (!claim.count || !increasedCounts(current, device.lastCounts)) continue;
  const result = await sendNativePush(device, message(items));
  if (!result.ok && !result.gone) {
   await db.nativePushDevice.updateMany({where: {id: device.id, shopId, updatedAt: claimedAt}, data: {lastCounts: device.lastCounts ?? Prisma.DbNull}});
   reasons.add(`${device.platform} ${result.reason}`);
  }
 }
 if (reasons.size) throw new Error([...reasons].join(", "));
}
