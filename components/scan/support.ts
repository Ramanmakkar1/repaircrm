/**
 * What this browser can actually do, and the DOM types TypeScript is missing.
 *
 * ---------------------------------------------------------------------------
 * WHY FEATURE DETECTION IS A FIRST-CLASS CONCERN HERE
 * ---------------------------------------------------------------------------
 * A camera button that does nothing is worse than no button. Three things can
 * be missing independently, and each has a different honest answer:
 *
 *   no getUserMedia at all   an ancient browser, or a webview with media off.
 *                            Hide the button.
 *   not a secure context     the app is being served over plain http on a LAN
 *                            IP. The camera is REFUSED with no useful error, so
 *                            the UI has to say "this needs HTTPS" itself.
 *   no camera on the device  a desktop till. Hide the button — that is exactly
 *                            the machine the phone-as-scanner flow is for.
 *
 * The first two are answered synchronously. The third needs
 * `enumerateDevices()`, which is async and, before permission is granted,
 * returns entries with empty labels — enough to count cameras, not to name
 * them. So the button renders optimistically on a browser that COULD have a
 * camera and hides itself once the count comes back zero.
 */

/**
 * `BarcodeDetector` is a real browser API (Chrome on Android, Chrome/Edge on
 * desktop) that TypeScript's DOM library does not describe yet, and it is
 * absent from Safari — which means absent from every browser on an iPhone,
 * because they are all WebKit underneath. Hence the WASM fallback.
 */
export type NativeBarcodeFormat =
  | "upc_a"
  | "upc_e"
  | "ean_13"
  | "ean_8"
  | "code_128"
  | "code_39"
  | "itf"
  | "qr_code";

export interface NativeDetectedBarcode {
  rawValue: string;
  format: string;
}

export interface NativeBarcodeDetector {
  detect(source: CanvasImageSource | ImageBitmap | Blob): Promise<NativeDetectedBarcode[]>;
}

export interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** The constructor, or undefined on a browser without it (every iPhone). */
export function nativeBarcodeDetector(): NativeBarcodeDetectorConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
    .BarcodeDetector;
}

/** Why the camera cannot be used, or null when it can be tried. */
export type CameraBlocker = "unsupported" | "insecure";

/** The synchronous half of the answer: is a camera worth offering at all? */
export function cameraBlocker(): CameraBlocker | null {
  if (typeof window === "undefined") return "unsupported";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }
  // getUserMedia is only granted in a secure context: https, or localhost. On a
  // bare LAN IP over http it fails with an opaque error, so this is caught here
  // and explained rather than shown as a dead black rectangle.
  if (window.isSecureContext === false) return "insecure";
  return null;
}

/** True when this device has at least one video input. Needs no permission. */
export async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === "videoinput");
  } catch {
    return false;
  }
}

/**
 * `navigator.vibrate`, guarded.
 *
 * Desktop Chrome defines it and does nothing; Safari does not define it at
 * all; and a browser can throw if the page has never been interacted with. A
 * failed buzz must never cost the shop a scan.
 */
export function buzz(ms = 40): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // A phone that will not buzz still scanned the barcode.
  }
}
