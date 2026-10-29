/**
 * Facts about the native iOS / Android shells (see mobile/README.md).
 *
 * The shells are Capacitor WebViews that load this very site. Everything the
 * server needs to know about them lives here, so the deep-link files, the
 * Google sign-in hand-off and mobile/capacitor.config.json can be checked
 * against one list.
 *
 * Pure: no `next/*`, no `db`.
 */

/** Bundle id (iOS) and application id (Android). Must match mobile/capacitor.config.json. */
export const NATIVE_APP_ID = "com.repairshelper.app";

/**
 * The custom URL scheme the shells register. Used only to bring the app back
 * to the front after Google sign-in in the system browser tab; it never
 * carries anything usable on its own (see lib/google/native-handoff.ts).
 */
export const NATIVE_URL_SCHEME = "com.repairshelper.app";

/**
 * TODO(owner): the 10-character Team ID from developer.apple.com → Membership.
 * While it still starts with "TODO", /.well-known/apple-app-site-association
 * answers 404 rather than publishing a file that names nobody's app.
 */
export const APPLE_TEAM_ID: string = "TODO_APPLE_TEAM_ID";

/**
 * TODO(owner): SHA-256 fingerprint(s) of the Android signing key, as
 * "AA:BB:…" (32 pairs). With Play App Signing, copy it from Play Console →
 * Setup → App signing → "App signing key certificate". Add the upload key's
 * fingerprint too if you sideload release builds. While the list holds only
 * the placeholder, /.well-known/assetlinks.json answers 404.
 */
export const ANDROID_CERT_SHA256: readonly string[] = ["TODO_ANDROID_SHA256_FINGERPRINT"];

/**
 * The paths a tapped https://repairshelper.com link may open in the app
 * instead of the browser. The staff app and the sign-in screens only — not
 * the marketing pages, not /api, and not the public shop hub or check-in desk,
 * which are embedded on shops' own websites and meant for their customers.
 *
 * Mirrored by the Android intent filter in
 * mobile/android/app/src/main/AndroidManifest.xml.
 */
export const NATIVE_LINK_PATHS: readonly string[] = [
  "/counter",
  "/dashboard",
  "/tickets",
  "/invoices",
  "/estimates",
  "/customers",
  "/inventory",
  "/pos",
  "/appointments",
  "/leads",
  "/reports",
  "/settings",
  "/time-clock",
  "/login",
  "/reset-password",
];

export function placeholder(value: string): boolean {
  return value.startsWith("TODO");
}

/**
 * Same-site paths the app opens in the system browser tab instead of its own
 * WebView: file downloads (CSV exports, attachments, import samples) and print
 * views. The Android WebView saves no downloads and neither WebView prints, but
 * Chrome Custom Tabs and SFSafariViewController do both. The tab has its own
 * cookie jar, so it gets a short, path-scoped session through
 * /api/auth/native/browser (lib/native/browser-pass.ts).
 *
 * Prefixes ending in "/" match below them; the others match exactly.
 */
export const NATIVE_BROWSER_PATHS: readonly string[] = [
  "/api/exports/",
  "/print/",
  "/files/",
  "/time-clock/export",
  "/customers/import/sample",
  "/inventory/import/sample",
];

/** Whether a same-site pathname belongs in the system browser (see above). */
export function opensInSystemBrowser(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\") || pathname.includes("..")) {
    return false;
  }
  return NATIVE_BROWSER_PATHS.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) && pathname.length > prefix.length : pathname === prefix,
  );
}
