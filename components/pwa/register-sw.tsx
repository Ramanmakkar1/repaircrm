"use client";

import * as React from "react";

/**
 * Registers public/sw.js — in PRODUCTION ONLY.
 *
 * A service worker in development is a debugging trap: it serves yesterday's
 * chunks after a hot reload, and the symptom is a blank screen with no error.
 * `next dev` also rewrites `/_next/static` on every edit, which is exactly what
 * the worker caches most aggressively.
 *
 * Registration is deferred to `load` so it never competes with the first paint
 * for bandwidth, and every failure is swallowed: a browser with service workers
 * disabled, a private window, or an insecure origin must degrade to a perfectly
 * ordinary web app rather than a console full of red.
 *
 * Renders nothing.
 */
export function RegisterServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* unsupported, blocked, or insecure origin — nothing to do about it */
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
