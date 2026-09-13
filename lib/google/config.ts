/**
 * "Sign in with Google" configuration — staff accounts only.
 *
 * THIS IS NOT THE CUSTOMER PORTAL. Customers get in with the magic links in
 * lib/comms/config.ts (`/portal/i/…`, `/portal/e/…`), which is right: a person
 * who dropped off a phone should never have to have a Google account, and the
 * portal deliberately has no password of any kind. Everything in lib/google is
 * about the people who work at the shop.
 *
 * Mirrors lib/integrations/config.ts and lib/payments/config.ts on purpose:
 * the whole feature is switched on by environment, so the same call sites work
 * on a laptop with nothing configured and in production with a real Google
 * Cloud OAuth client.
 *
 *   GOOGLE_CLIENT_ID       OAuth 2.0 Client ID   (…apps.googleusercontent.com)
 *   GOOGLE_CLIENT_SECRET   OAuth 2.0 Client secret
 *
 * FAIL CLOSED. With either missing, `googleConfigured()` is false: the button
 * does not render on any screen, and both route handlers refuse before they
 * touch the network. A half-configured OAuth client is a redirect loop, not an
 * error message, and that is a miserable thing to debug from a sign-in form.
 *
 * ---------------------------------------------------------------------------
 * ENDPOINTS AND WHY THEY ARE OVERRIDABLE
 * ---------------------------------------------------------------------------
 * The three Google endpoints have env overrides. In production nobody sets
 * them and the documented Google URLs below are used verbatim. In development
 * they point at scripts/dev/fake-google.mjs, which mints real RS256 id_tokens
 * from a key pair it publishes at its own JWKS endpoint — that is how this
 * workstream is verified end to end without Google credentials.
 *
 * The ISSUER is deliberately NOT overridable. `iss` must be Google's, always;
 * the fake IdP claims Google's issuer like any impostor would, which is what
 * makes the check in lib/google/oidc.ts a real check rather than a formality.
 * ---------------------------------------------------------------------------
 */

import { appUrl } from "@/lib/comms/config";

/** Everything RepairPilot needs: who you are, and the name to put on tickets. */
export const GOOGLE_SCOPE = "openid email profile";

/**
 * Both spellings Google has ever put in an `iss` claim. Google's own discovery
 * document lists the bare host; older libraries expect the https form.
 */
export const GOOGLE_ISSUERS = [
  "accounts.google.com",
  "https://accounts.google.com",
] as const;

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function googleClientId(): string | null {
  return env("GOOGLE_CLIENT_ID");
}

/** Server-only. Never reaches a client component — see components/auth. */
export function googleClientSecret(): string | null {
  return env("GOOGLE_CLIENT_SECRET");
}

/** The one switch. False means the feature does not exist on this server. */
export function googleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/** Where the person is sent to choose a Google account. */
export function googleAuthorizeUrl(): string {
  const base = (env("GOOGLE_AUTH_BASE") ?? "https://accounts.google.com").replace(
    /\/+$/,
    "",
  );
  return `${base}/o/oauth2/v2/auth`;
}

/** Where the authorization code is exchanged for an id_token. */
export function googleTokenUrl(): string {
  return env("GOOGLE_TOKEN_URL") ?? "https://oauth2.googleapis.com/token";
}

/** Google's signing keys, for verifying the id_token. */
export function googleJwksUrl(): string {
  return env("GOOGLE_JWKS_URL") ?? "https://www.googleapis.com/oauth2/v3/certs";
}

/**
 * The redirect URI, which must match the one registered in Google Cloud
 * Console character for character. APP_URL is a server-only runtime variable
 * on Workers, so it is not frozen to a developer's localhost value by the
 * Next.js build. NEXT_PUBLIC_APP_URL remains the local-development fallback in
 * appUrl().
 */
export function googleRedirectUri(): string {
  return `${appUrl()}/api/auth/google/callback`;
}

/**
 * The env vars this feature needs, with whether each one is populated.
 * Only the booleans may ever reach the browser — never a secret's value.
 */
export function googleEnvVars(): { name: string; set: boolean }[] {
  return [
    { name: "GOOGLE_CLIENT_ID", set: Boolean(googleClientId()) },
    { name: "GOOGLE_CLIENT_SECRET", set: Boolean(googleClientSecret()) },
  ];
}
