"use server";
import webpush from "web-push";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearPushDevice, PUSH_COOKIE } from "@/lib/push/device";
import { validPushEndpoint } from "@/lib/push/validation";
import { sendPush } from "@/lib/push/send";
import { rateLimit } from "@/lib/rate-limit";
const schema = z.object({endpoint: z.string().max(2048).refine(validPushEndpoint), keys: z.object({p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/)})});
export async function pushPublicKeyAction(): Promise<string> {
 const {shopId} = await requireUser();
 let shop = await db.shop.findUnique({where: {id: shopId}, select: {pushPublicKey: true}});
 if (!shop?.pushPublicKey) {
  const keys = webpush.generateVAPIDKeys();
  await db.shop.updateMany({where: {id: shopId, pushPublicKey: null}, data: {pushPublicKey: keys.publicKey, pushPrivateKey: keys.privateKey}});
  shop = await db.shop.findUnique({where: {id: shopId}, select: {pushPublicKey: true}});
 }
 if (!shop?.pushPublicKey) throw new Error("Phone notifications are unavailable. Try again.");
 return shop.pushPublicKey;
}
export async function subscribePushAction(input: unknown) {
 const {shopId, userId} = await requireUser();
 if (!rateLimit(`push-subscribe:${userId}`, 10, 60_000).allowed) return {ok: false, error: "Wait a minute and try again."};
 const parsed = schema.safeParse(input);
 if (!parsed.success) return {ok: false, error: "This browser supplied an unsupported push subscription."};
 const subscription = parsed.data;
 const row = await db.pushSubscription.upsert({where: {endpoint: subscription.endpoint}, create: {shopId, userId, endpoint: subscription.endpoint, ...subscription.keys}, update: {shopId, userId, ...subscription.keys, lastCounts: {}}, select: {id: true}});
 const jar = await cookies(); jar.set(PUSH_COOKIE, row.id, {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60});
 return {ok: true};
}
export async function unsubscribePushAction() {
 const {shopId, userId} = await requireUser(); await clearPushDevice(shopId, userId); return {ok: true};
}
export async function testPushAction() {
 const {shopId, userId} = await requireUser();
 if (!rateLimit(`push-test:${userId}`, 3, 60_000).allowed) return {ok: false, error: "Wait a minute before another test."};
 const id = (await cookies()).get(PUSH_COOKIE)?.value;
 if (!id) return {ok: false, error: "Turn on notifications on this device first."};
 const [device, shop] = await Promise.all([db.pushSubscription.findFirst({where: {id, shopId, userId}}), db.shop.findUnique({where: {id: shopId}, select: {pushPublicKey: true, pushPrivateKey: true}})]);
 if (!device || !shop?.pushPublicKey || !shop.pushPrivateKey) return {ok: false, error: "Turn on notifications again."};
 try {await sendPush(device, {publicKey: shop.pushPublicKey, privateKey: shop.pushPrivateKey}, {title: "Repairs helper", body: "Phone notifications are working.", url: "/"}); return {ok: true};} catch {return {ok: false, error: "The test could not be delivered. Turn notifications off and on again."};}
}

export async function pushDeviceStatusAction(): Promise<boolean> {
 const {shopId, userId} = await requireUser();
 const id = (await cookies()).get(PUSH_COOKIE)?.value;
 if (!id) return false;
 return Boolean(await db.pushSubscription.findFirst({where: {id, shopId, userId}, select: {id: true}}));
}
