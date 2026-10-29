/**
 * The iOS / Android app, seen from the page.
 *
 * The native shells (mobile/) are Capacitor WebViews that load this site. On
 * that origin Capacitor injects `window.Capacitor`, with the native plugins
 * the shell bundles under `Capacitor.Plugins`. Reading them from the window —
 * instead of importing @capacitor/* into the web bundle — keeps the website's
 * dependencies and bundle exactly as they were: in a normal browser every
 * function here is a cheap no-op.
 *
 * Only the handful of plugin methods the site actually calls are typed.
 * Client-only.
 */

type Listener = { remove: () => Promise<void> };
type PushPermission = { receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" };

type Plugins = {
  App?: {
    addListener(event: "appUrlOpen", cb: (e: { url: string }) => void): Promise<Listener>;
    getLaunchUrl(): Promise<{ url: string } | undefined>;
  };
  Browser?: {
    open(options: { url: string; presentationStyle?: "fullscreen" | "popover" }): Promise<void>;
    close(): Promise<void>;
  };
  Haptics?: {
    impact(options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
    notification(options: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
  };
  SplashScreen?: { hide(options?: { fadeOutDuration?: number }): Promise<void> };
  StatusBar?: { setStyle(options: { style: "DARK" | "LIGHT" | "DEFAULT" }): Promise<void> };
  Camera?: {
    /** Deprecated in @capacitor/camera 8, but the one call that returns the full image as base64. */
    getPhoto(options: {
      resultType: "base64";
      source: "CAMERA";
      quality?: number;
      width?: number;
      correctOrientation?: boolean;
      saveToGallery?: boolean;
    }): Promise<{ base64String?: string; format: string }>;
  };
  PushNotifications?: {
    checkPermissions(): Promise<PushPermission>;
    requestPermissions(): Promise<PushPermission>;
    register(): Promise<void>;
    /** Android only. */
    createChannel(channel: { id: string; name: string; description?: string; importance?: 1 | 2 | 3 | 4 | 5 }): Promise<void>;
    addListener(event: "registration", cb: (token: { value: string }) => void): Promise<Listener>;
    addListener(event: "registrationError", cb: (error: { error: string }) => void): Promise<Listener>;
    addListener(
      event: "pushNotificationActionPerformed",
      cb: (action: { notification: { data?: Record<string, unknown> } }) => void,
    ): Promise<Listener>;
  };
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: Plugins;
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** True inside the iOS / Android app. Always false on the server and in browsers. */
export function isNativeApp(): boolean {
  return capacitor() !== null;
}

/** "ios" | "android" inside the app, null elsewhere. */
export function nativePlatform(): "ios" | "android" | null {
  const platform = capacitor()?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : null;
}

/** A native plugin, or null when not in the app or the shell does not bundle it. */
export function nativePlugin<K extends keyof Plugins>(name: K): NonNullable<Plugins[K]> | null {
  const cap = capacitor();
  if (!cap) return null;
  if (cap.isPluginAvailable && !cap.isPluginAvailable(name)) return null;
  return (cap.Plugins?.[name] as NonNullable<Plugins[K]> | undefined) ?? null;
}

/** A short haptic tick inside the app; false when there are no native haptics. */
export function nativeHaptic(kind: "tap" | "success" | "error" = "tap"): boolean {
  const haptics = nativePlugin("Haptics");
  if (!haptics) return false;
  const done =
    kind === "tap"
      ? haptics.impact({ style: "LIGHT" })
      : haptics.notification({ type: kind === "success" ? "SUCCESS" : "ERROR" });
  done.catch(() => {});
  return true;
}

/** The user-agent marker the shells append (mobile/capacitor.config.json). */
export const NATIVE_UA_MARKER = "RepairsHelperApp";

/**
 * Whether the shell says push is set up. Android crashes on register() until
 * google-services.json is added, so its config appends "push-off" to the user
 * agent until the owner has done that (mobile/README.md).
 */
export function nativePushEnabled(): boolean {
  return isNativeApp() && !/\bpush-off\b/.test(navigator.userAgent);
}
