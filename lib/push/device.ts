import { cookies } from "next/headers";
import { db } from "@/lib/db";
export const PUSH_COOKIE = "rf_push_device";
/** The NativePushDevice row this app install registered (app/api/push/native). */
export const NATIVE_PUSH_COOKIE = "rf_native_push";
/** Sign-out / staff switch: this browser or app install stops getting this person's alerts. */
export async function clearPushDevice(shopId: string, userId: string) {
 const jar = await cookies(); const id = jar.get(PUSH_COOKIE)?.value;
 if (id) await db.pushSubscription.deleteMany({where: {id, shopId, userId}});
 jar.delete(PUSH_COOKIE);
 const nativeId = jar.get(NATIVE_PUSH_COOKIE)?.value;
 if (nativeId) {await db.nativePushDevice.deleteMany({where: {id: nativeId, shopId, userId}}); jar.delete(NATIVE_PUSH_COOKIE);}
}
