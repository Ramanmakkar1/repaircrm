import { db } from "@/lib/db";

import { apnsConfig, sendApns, type NativeMessage, type SendResult } from "./apns";
import { fcmConfig, sendFcm } from "./fcm";

/**
 * Native push for the iOS / Android app (mobile/): APNs for "ios" devices,
 * FCM HTTP v1 for "android" ones. Tokens come from /api/push/native.
 *
 * Fails closed and quietly: with a platform's env missing, its devices are
 * not queried and nothing is sent (lib/preflight.ts warns about half-set env).
 */

export type { NativeMessage, SendResult };

/** The platforms whose provider credentials are present. */
export function nativePushPlatforms(): ("ios" | "android")[] {
  const platforms: ("ios" | "android")[] = [];
  if (apnsConfig()) platforms.push("ios");
  if (fcmConfig()) platforms.push("android");
  return platforms;
}

/**
 * Send one notification to one stored device. A token the provider calls dead
 * (APNs 410 / BadDeviceToken, FCM UNREGISTERED) is deleted here.
 */
export async function sendNativePush(
  device: { id: string; shopId: string; platform: string; token: string },
  message: NativeMessage,
): Promise<SendResult> {
  const result =
    device.platform === "ios"
      ? await sendApns(device.token, message)
      : device.platform === "android"
        ? await sendFcm(device.token, message)
        : ({ ok: false, gone: true, reason: "unknown platform" } as const);
  if (!result.ok && result.gone) {
    await db.nativePushDevice.deleteMany({ where: { id: device.id, shopId: device.shopId } });
  }
  return result;
}
