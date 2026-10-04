import { cookies } from "next/headers";
import { db } from "@/lib/db";
export const PUSH_COOKIE = "rf_push_device";
export async function clearPushDevice(shopId: string, userId: string) {
 const jar = await cookies(); const id = jar.get(PUSH_COOKIE)?.value;
 if (id) await db.pushSubscription.deleteMany({where: {id, shopId, userId}});
 jar.delete(PUSH_COOKIE);
}
