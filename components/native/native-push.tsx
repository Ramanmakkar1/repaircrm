"use client";

import * as React from "react";

import { nativePlatform, nativePlugin, nativePushEnabled } from "@/lib/native/capacitor";

/**
 * Registers the phone for native push, inside the iOS / Android app only.
 *
 * Mounted in the signed-in (app) layout, so the permission prompt comes after
 * sign-in, when "notifications for your shop" means something — never on the
 * marketing page. Asks once; the OS remembers the answer.
 *
 * A tapped notification may carry `data.url` (a same-site path) to open:
 * lib/push/apns.ts puts `url` beside `aps` (iOS hands the whole payload over
 * as `data`), lib/push/fcm.ts sends it as FCM `data.url`. A tap that launched
 * the app is retained by the plugin until this listener is added.
 */
export function NativePush() {
  React.useEffect(() => {
    if (!nativePushEnabled()) return;
    const push = nativePlugin("PushNotifications");
    const platform = nativePlatform();
    if (!push || !platform) return;

    let cancelled = false;
    const listeners: { remove: () => Promise<void> }[] = [];
    const keep = (listener: { remove: () => Promise<void> }) => {
      if (cancelled) void listener.remove();
      else listeners.push(listener);
    };

    (async () => {
      let status = await push.checkPermissions();
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        status = await push.requestPermissions();
      }
      if (cancelled || status.receive !== "granted") return;

      keep(
        await push.addListener("registration", ({ value }) => {
          void fetch("/api/push/native", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, token: value }),
          }).catch(() => {});
        }),
      );
      keep(
        await push.addListener("registrationError", ({ error }) => {
          // Expected until the APNs key / google-services.json are in place.
          console.warn("[push] native registration failed:", error);
        }),
      );
      keep(
        await push.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const url = notification.data?.url;
          if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) {
            window.location.assign(url);
          }
        }),
      );
      if (platform === "android") {
        // The channel FCM messages name (lib/push/fcm.ts → ANDROID_CHANNEL_ID),
        // so Android settings show "Shop alerts" rather than "Miscellaneous".
        await push
          .createChannel({ id: "shop", name: "Shop alerts", description: "Jobs and messages waiting for you", importance: 4 })
          .catch(() => {});
      }
      if (!cancelled) await push.register();
    })().catch(() => {});

    return () => {
      cancelled = true;
      for (const listener of listeners) void listener.remove();
    };
  }, []);

  return null;
}
