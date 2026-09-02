/**
 * Accounting integration configuration.
 *
 * Mirrors lib/payments/config.ts and lib/comms/config.ts on purpose: the whole
 * feature is switched on by environment, so the same call site works on a
 * laptop with nothing configured (the cards say what is missing and no button
 * does anything) and in production with real Intuit / Xero apps.
 *
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET      Intuit app credentials
 *   QBO_ENVIRONMENT = sandbox | production
 *   XERO_CLIENT_ID, XERO_CLIENT_SECRET    Xero app credentials
 *
 * FAIL CLOSED. With the credentials absent every entry point refuses before it
 * touches the network, and the Integrations tab names the exact variables the
 * server is missing — a half-configured OAuth app is a redirect loop, not an
 * error message, and that is a miserable thing to debug from a settings screen.
 *
 * ---------------------------------------------------------------------------
 * BASE URLs AND WHY THEY ARE OVERRIDABLE
 * ---------------------------------------------------------------------------
 * Every provider host has an env override. In production nobody sets them and
 * the documented Intuit/Xero endpoints below are used verbatim. In development
 * they point at scripts/dev/fake-quickbooks.mjs and scripts/dev/fake-xero.mjs,
 * which speak the same protocol — that is how this workstream is verified end
 * to end without provider credentials.
 * ---------------------------------------------------------------------------
 */

import { appUrl } from "@/lib/comms/config";

export type ProviderName = "quickbooks" | "xero";

export const PROVIDERS: readonly ProviderName[] = ["quickbooks", "xero"];

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
};

export function isProvider(value: unknown): value is ProviderName {
  return value === "quickbooks" || value === "xero";
}

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** Trailing slashes are stripped so `${base}/v3/...` never doubles up. */
function base(name: string, fallback: string): string {
  return (env(name) ?? fallback).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// QuickBooks Online
// ---------------------------------------------------------------------------

export function qboClientId(): string | null {
  return env("QBO_CLIENT_ID");
}

export function qboClientSecret(): string | null {
  return env("QBO_CLIENT_SECRET");
}

/** Anything other than an explicit "production" is treated as sandbox. */
export function qboEnvironment(): "sandbox" | "production" {
  return env("QBO_ENVIRONMENT")?.toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

/** Where the operator is sent to grant access. */
export function qboAuthBase(): string {
  return base("QBO_AUTH_BASE", "https://appcenter.intuit.com");
}

/** Where authorization codes and refresh tokens are exchanged. */
export function qboOAuthBase(): string {
  return base("QBO_OAUTH_BASE", "https://oauth.platform.intuit.com");
}

/** Where a refresh token is revoked on disconnect. */
export function qboRevokeBase(): string {
  return base("QBO_REVOKE_BASE", "https://developer.api.intuit.com");
}

/** The Accounting API host. Defaults follow QBO_ENVIRONMENT. */
export function qboApiBase(): string {
  return base(
    "QBO_API_BASE",
    qboEnvironment() === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com",
  );
}

/**
 * Accounting API minor version. 75 is the oldest version that still accepts
 * every field written here; pinning it means an Intuit default bump cannot
 * silently change how an invoice is interpreted.
 */
export const QBO_MINOR_VERSION = "75";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

export function qboConfigured(): boolean {
  return Boolean(qboClientId() && qboClientSecret());
}

// ---------------------------------------------------------------------------
// Xero
// ---------------------------------------------------------------------------

export function xeroClientId(): string | null {
  return env("XERO_CLIENT_ID");
}

export function xeroClientSecret(): string | null {
  return env("XERO_CLIENT_SECRET");
}

/** Where the operator grants access. */
export function xeroLoginBase(): string {
  return base("XERO_LOGIN_BASE", "https://login.xero.com");
}

/** Where authorization codes and refresh tokens are exchanged. */
export function xeroIdentityBase(): string {
  return base("XERO_IDENTITY_BASE", "https://identity.xero.com");
}

/** The Accounting API host — also serves GET /connections. */
export function xeroApiBase(): string {
  return base("XERO_API_BASE", "https://api.xero.com");
}

/**
 * `offline_access` is what makes the refresh token appear; without it the
 * connection dies 30 minutes after it is made and the shop's books stop
 * syncing overnight with no visible cause.
 */
export const XERO_SCOPE =
  "openid profile email accounting.transactions accounting.contacts offline_access";

export function xeroConfigured(): boolean {
  return Boolean(xeroClientId() && xeroClientSecret());
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export function providerConfigured(provider: ProviderName): boolean {
  return provider === "quickbooks" ? qboConfigured() : xeroConfigured();
}

/**
 * The env vars a provider needs, with whether each one is populated.
 * Only the booleans ever reach the browser — never a secret's value.
 */
export function providerEnvVars(
  provider: ProviderName,
): { name: string; set: boolean }[] {
  return provider === "quickbooks"
    ? [
        { name: "QBO_CLIENT_ID", set: Boolean(qboClientId()) },
        { name: "QBO_CLIENT_SECRET", set: Boolean(qboClientSecret()) },
        { name: "QBO_ENVIRONMENT", set: Boolean(env("QBO_ENVIRONMENT")) },
      ]
    : [
        { name: "XERO_CLIENT_ID", set: Boolean(xeroClientId()) },
        { name: "XERO_CLIENT_SECRET", set: Boolean(xeroClientSecret()) },
      ];
}

/**
 * The redirect URI, which must match the one registered with the provider
 * character for character. Built from NEXT_PUBLIC_APP_URL so a deploy that
 * forgot to set it is obvious on the settings screen rather than at the far
 * end of an OAuth round trip.
 */
export function redirectUri(provider: ProviderName): string {
  return `${appUrl()}/api/integrations/${provider}/callback`;
}
