"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { NATIVE_UA_MARKER } from "@/lib/native/capacitor";

/**
 * Microsoft Clarity (heatmaps + session replay) for the public website ONLY.
 *
 * Signed-in shop screens, the customer portal, print pages and check-in
 * desks show customers' names, phones and devices, so they are never
 * recorded: the allow-list below is exact paths and prefixes of public
 * marketing, legal and sign-in pages. A new public page has to be added
 * here on purpose. The tag only loads on the production hostnames, so local
 * and preview builds never send sessions to the live project.
 */
const CLARITY_ID = "z52j9w9ah3";
// Never inside the iOS / Android app (its user agent carries NATIVE_UA_MARKER):
// the store privacy answers (mobile/STORE-LISTING.md) say the app has no
// third-party analytics.
const CLARITY_HOSTS = ["repairshelper.com", "www.repairshelper.com"];

const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/feedback",
  "/privacy",
  "/terms",
  "/delete-account",
]);
const PUBLIC_PREFIXES = ["/pricing", "/features", "/contact", "/compare", "/software"];

export function isClarityPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type ClarityFn = (command: "start" | "stop") => void;

export function Clarity() {
  const pathname = usePathname();
  const allowed = Boolean(pathname && isClarityPath(pathname));

  // Signing in is a client-side navigation, so a tag loaded on /login would
  // otherwise keep recording inside the shop. Stop it on every private
  // screen and resume only when the visitor is back on a public page.
  useEffect(() => {
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity;
    clarity?.(allowed ? "start" : "stop");
  }, [allowed]);

  if (!allowed) return null;
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`if(${JSON.stringify(CLARITY_HOSTS)}.indexOf(location.hostname)!==-1&&navigator.userAgent.indexOf(${JSON.stringify(NATIVE_UA_MARKER)})===-1)(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(CLARITY_ID)});`}
    </Script>
  );
}
