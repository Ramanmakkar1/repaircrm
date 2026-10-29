import { headers } from "next/headers";

import { isIosAppUserAgent } from "@/lib/native-app";

import { googleConfigured } from "./config";

/**
 * Whether this request's screen should offer "Continue with Google".
 *
 * Everywhere Google is configured, EXCEPT inside the iOS app. App Store
 * guideline 4.8 (Login Services): an app that offers a third-party login must
 * also offer an equivalent privacy-focused one (in practice, Sign in with
 * Apple). The iOS app instead offers no third-party login at all: email and
 * password, or a code emailed to you — which also signs in people who
 * created their account with Google. Android and the website keep Google.
 * mobile/README.md → "Google sign-in" has the reasoning.
 *
 * Server-only (reads request headers). The routes themselves stay open: the
 * button is what the guideline is about.
 */
export async function googleOffered(): Promise<boolean> {
  if (!googleConfigured()) return false;
  const userAgent = (await headers()).get("user-agent");
  return !isIosAppUserAgent(userAgent);
}
