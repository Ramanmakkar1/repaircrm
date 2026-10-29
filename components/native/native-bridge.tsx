"use client";

import * as React from "react";

import { opensInSystemBrowser } from "@/lib/native-app";
import { isNativeApp, nativePlatform, nativePlugin } from "@/lib/native/capacitor";

/**
 * Glue between the site and the iOS / Android app shell (mobile/).
 *
 * Mounted once in the root layout. In a normal browser it does nothing at
 * all: every branch starts with "are we inside the app?".
 *
 * Inside the app it:
 *   · hides the native splash screen once the page has actually rendered;
 *   · keeps the status bar text legible against the current theme;
 *   · opens deep links (https://repairshelper.com/tickets/…) in the WebView;
 *   · runs "Continue with Google" in the system browser tab, because Google
 *     refuses sign-in inside an embedded WebView (lib/google/native-handoff.ts);
 *   · opens downloads (CSV exports, attachments) and print views in that tab
 *     too, signed in for that one path, because the Android WebView saves no
 *     downloads and neither WebView prints (lib/native/browser-pass.ts);
 *   · keeps same-site target=_blank links in the app (iOS would otherwise
 *     hand them to Safari, which is signed out).
 *
 * Links to other sites and tel:/mailto:/sms: need nothing here — the shell
 * already sends every navigation off repairshelper.com to the system.
 */

const VERIFIER_KEY = "rh-native-google-verifier";
const LAUNCH_KEY = "rh-native-launch-url";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function newChallenge(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
  } catch {
    // Without storage the hand-off cannot complete; the server will say
    // "try again" rather than sign anyone in.
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function takeVerifier(): string | null {
  try {
    const value = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    return value;
  } catch {
    return null;
  }
}

/** Same rule as the server's safeNextPath: a same-origin path or "/". */
function safePath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

/** Handles a URL the OS handed to the app: the Google return, or a deep link. */
function openAppUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }

  // com.repairshelper.app://google-auth?handoff=…&next=…
  if (url.protocol === "com.repairshelper.app:") {
    void nativePlugin("Browser")?.close().catch(() => {});
    const handoff = url.searchParams.get("handoff");
    const next = safePath(url.searchParams.get("next"));
    const verifier = takeVerifier();
    if (handoff && verifier) {
      const query = new URLSearchParams({ handoff, verifier });
      // A real navigation, not the router: the route handler sets the cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/api/auth/native/complete?${query.toString()}`);
    } else {
      // An outcome with nothing to carry (cancelled, refused…): show it.
      window.location.assign(next);
    }
    return;
  }

  // Universal link / App Link to this site: open the same path in the WebView.
  if (url.protocol === "https:" && url.host === window.location.host) {
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      // A full load, so the server re-checks the session for the new screen.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(path);
    }
  }
}

/**
 * Opens a same-site download or print path in the system browser tab, with a
 * one-path pass so the tab is signed in (lib/native/browser-pass.ts).
 */
async function openInSystemBrowser(path: string): Promise<void> {
  const browser = nativePlugin("Browser");
  if (!browser) {
    // An old shell without the Browser plugin: the WebView is all there is.
    window.location.assign(path);
    return;
  }
  let response: Response;
  try {
    response = await fetch("/api/auth/native/browser-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    window.alert("You're offline. Connect to the internet and try again.");
    return;
  }
  if (response.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
    return;
  }
  const data = (await response.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
  if (!response.ok || !data?.ok || typeof data.url !== "string") {
    window.alert("That could not be opened. Try again in a moment.");
    return;
  }
  await browser.open({ url: new URL(data.url, window.location.origin).toString(), presentationStyle: "popover" });
}

function syncStatusBar() {
  const statusBar = nativePlugin("StatusBar");
  if (!statusBar) return;
  const theme = document.documentElement.dataset.theme;
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // DARK = light text for a dark background, and vice versa.
  statusBar.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {});
}

export function NativeBridge() {
  React.useEffect(() => {
    if (!isNativeApp()) return;

    // The shell opens the site's root. Signed in, the server already sends
    // that to the shop's home screen; signed out it would be the marketing
    // page, which is not what someone who installed the app is here for.
    if (window.location.pathname === "/") {
      window.location.replace("/login");
      return;
    }

    const platform = nativePlatform();
    if (platform) document.documentElement.dataset.native = platform;

    nativePlugin("SplashScreen")?.hide({ fadeOutDuration: 200 }).catch(() => {});

    syncStatusBar();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncStatusBar);
    const themeObserver = new MutationObserver(syncStatusBar);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const app = nativePlugin("App");
    let removeListener: (() => void) | undefined;
    let disposed = false;
    if (app) {
      app
        .addListener("appUrlOpen", ({ url }) => openAppUrl(url))
        .then((listener) => {
          if (disposed) void listener.remove();
          else removeListener = () => void listener.remove();
        })
        .catch(() => {});

      // A cold start from a tapped link: the WebView opened the start page, so
      // go to the link — once, not again on every later full page load.
      app
        .getLaunchUrl()
        .then((launch) => {
          if (!launch?.url) return;
          try {
            if (sessionStorage.getItem(LAUNCH_KEY) === launch.url) return;
            sessionStorage.setItem(LAUNCH_KEY, launch.url);
          } catch {
            return;
          }
          openAppUrl(launch.url);
        })
        .catch(() => {});
    }

    // "Continue with Google" is a plain link to /api/auth/google/start. Inside
    // the app, run it in the system browser tab instead (capture phase, so it
    // wins over the router's own click handling).
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const target = new URL(anchor.href, window.location.href);

      // A picture made in the page (the QR code): the WebView cannot save it.
      if ((target.protocol === "data:" || target.protocol === "blob:") && anchor.hasAttribute("download")) {
        event.preventDefault();
        event.stopPropagation();
        window.alert("Saving this picture works on repairshelper.com in a web browser.");
        return;
      }

      if (target.origin !== window.location.origin) return;

      // Downloads and print views: the system browser tab, signed in for that path.
      if (opensInSystemBrowser(target.pathname)) {
        event.preventDefault();
        event.stopPropagation();
        void openInSystemBrowser(`${target.pathname}${target.search}`);
        return;
      }

      // Any other same-site "new tab" link: stay in the app.
      if (anchor.target === "_blank" && target.pathname !== "/api/auth/google/start") {
        event.preventDefault();
        event.stopPropagation();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${target.pathname}${target.search}${target.hash}`);
        return;
      }

      if (target.pathname !== "/api/auth/google/start") return;

      event.preventDefault();
      event.stopPropagation();

      if (target.searchParams.get("intent") === "link") {
        // Connecting Google to a signed-in profile needs this session inside the
        // browser tab, which the app cannot share. Web only, said plainly.
        window.alert(
          "Connect your Google account from repairshelper.com in a web browser. After that, “Continue with Google” works in the app too.",
        );
        return;
      }

      // Not offered in the iOS app (App Store guideline 4.8, lib/google/offer.ts);
      // this only catches a stray link.
      if (nativePlatform() === "ios") {
        window.alert("Sign in with your email and password, or tap “Email me a sign-in code”.");
        return;
      }

      const browser = nativePlugin("Browser");
      if (!browser) {
        window.alert("Google sign-in needs an app update. Sign in with your email for now.");
        return;
      }
      void newChallenge().then((challenge) => {
        target.searchParams.set("native", challenge);
        return browser.open({ url: target.toString(), presentationStyle: "popover" });
      });
    };
    window.addEventListener("click", onClick, true);

    // The Print buttons on /print/* call window.print(), which neither WebView
    // implements. Inside the app, print from the browser tab instead.
    const webPrint = window.print;
    window.print = () => {
      if (opensInSystemBrowser(window.location.pathname)) {
        void openInSystemBrowser(`${window.location.pathname}${window.location.search}`);
      } else {
        webPrint.call(window);
      }
    };

    return () => {
      window.print = webPrint;
      disposed = true;
      removeListener?.();
      media.removeEventListener("change", syncStatusBar);
      themeObserver.disconnect();
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
