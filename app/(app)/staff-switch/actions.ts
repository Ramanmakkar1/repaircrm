"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashPassword, requireUser, sessionFor, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { clearPushDevice } from "@/lib/push/device";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { setSessionCookie } from "@/lib/session";
export type PinState = { error?: string; message?: string };
const WINDOW = 15 * 60 * 1000;
export async function saveStaffPinAction(_state: PinState, data: FormData): Promise<PinState> {
  const session = await requireUser();
  if (!rateLimit(`pin-settings:${session.userId}`, 5, WINDOW).allowed) return {error: "Too many attempts. Try again in 15 minutes."};
  const user = await db.user.findFirst({where: {id: session.userId, shopId: session.shopId}, select: {passwordHash: true, totpEnabledAt: true, mustChangePassword: true}});
  if (!user || !await verifyPassword(String(data.get("password") ?? ""), user.passwordHash)) return {error: "Enter your current password."};
  const remove = data.get("remove") === "yes";
  const pin = String(data.get("pin") ?? "");
  if (!remove && (user.totpEnabledAt || user.mustChangePassword)) return {error: "Finish account setup or use full sign-in while two-step sign-in is on."};
  if (!remove && !/^\d{6}$/.test(pin)) return {error: "Choose exactly six digits."};
  if (!remove && pin !== String(data.get("confirm") ?? "")) return {error: "The two PINs do not match."};
  await db.user.updateMany({where: {id: session.userId, shopId: session.shopId, active: true}, data: {pinHash: remove ? null : await hashPassword(pin), pinVersion: crypto.randomUUID()}});
  clearRateLimit(`pin-settings:${session.userId}`);
  await audit({shopId: session.shopId, userId: session.userId, action: "user.pin_changed", entity: "user", entityId: session.userId, summary: remove ? "Staff PIN removed" : "Staff PIN changed"});
  revalidatePath("/staff-switch");
  return {message: remove ? "PIN removed. Use your usual sign-in." : "PIN saved. Switch staff from your account menu."};
}
export async function switchStaffAction(_state: PinState, data: FormData): Promise<PinState> {
  const current = await requireUser();
  const id = String(data.get("userId") ?? "");
  if (!rateLimit(`pin-shop:${current.shopId}`, 50, WINDOW).allowed || !rateLimit(`pin:${current.shopId}:${id}`, 5, WINDOW).allowed) return {error: "Too many PIN attempts. Use full sign-in or wait 15 minutes."};
  const pin = String(data.get("pin") ?? "");
  if (!/^\d{6}$/.test(pin)) return {error: "Enter a six-digit PIN."};
  const user = await db.user.findFirst({where: {id, shopId: current.shopId, active: true, mustChangePassword: false, totpEnabledAt: null, pinHash: {not: null}, pinVersion: {not: null}}});
  if (!user?.pinHash || !user.pinVersion || !await verifyPassword(pin, user.pinHash)) return {error: "That PIN did not match. Try again."};
  clearRateLimit(`pin:${current.shopId}:${id}`);
  await clearPushDevice(current.shopId, current.userId);
  await setSessionCookie({...sessionFor(user), pinv: user.pinVersion}, 8 * 60 * 60);
  await audit({shopId: current.shopId, userId: user.id, action: "user.staff_switch", entity: "user", entityId: user.id, summary: `${user.name} took over the counter`, meta: {fromUserId: current.userId}});
  redirect("/");
}
