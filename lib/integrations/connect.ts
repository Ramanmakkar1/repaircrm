import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

import {
  PROVIDER_LABEL,
  providerConfigured,
  redirectUri,
  type ProviderName,
} from "./config";
import { clearLinks } from "./links";
import { describe, signState, type TokenSet } from "./oauth";

/**
 * The half of the OAuth dance both providers' route handlers share.
 *
 * Kept out of the route files themselves because a route handler is the worst
 * possible place for a security decision to live in duplicate: two copies of
 * "is this person allowed to connect an accounting system to this tenant?"
 * eventually disagree, and the one that is wrong is the one that ships.
 */

/** Where every one of these routes ends up, success or failure. */
export const INTEGRATIONS_TAB = "/settings?tab=integrations";

export function backToTab(
  request: Request,
  params: Record<string, string> = {},
): NextResponse {
  const url = new URL(INTEGRATIONS_TAB, new URL(request.url).origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

/**
 * Only an owner may connect a provider, and only for their own shop.
 *
 * Returns the shopId or a redirect to send back instead. A technician who
 * finds the URL gets the settings screen, not an OAuth consent page billed to
 * the shop's Intuit app.
 */
export async function requireOwnerShop(
  request: Request,
  provider: ProviderName,
): Promise<{ shopId: string } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    const login = new URL("/login", new URL(request.url).origin);
    login.searchParams.set("redirectTo", INTEGRATIONS_TAB);
    return { response: NextResponse.redirect(login) };
  }
  if (session.role !== "OWNER") {
    return { response: backToTab(request, { error: "owner-only" }) };
  }
  if (!providerConfigured(provider)) {
    return { response: backToTab(request, { error: "not-configured" }) };
  }
  return { shopId: session.shopId };
}

/** Builds the provider's authorize URL with a freshly signed `state`. */
export async function authorizeUrl(
  base: string,
  path: string,
  provider: ProviderName,
  shopId: string,
  scope: string,
  clientId: string,
): Promise<string> {
  const url = new URL(`${base}${path}`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("state", await signState(shopId, provider));
  return url.toString();
}

/**
 * Writes the connection row.
 *
 * ---------------------------------------------------------------------------
 * RECONNECTING THE SAME COMPANY vs CONNECTING A DIFFERENT ONE
 * ---------------------------------------------------------------------------
 * Reconnecting the same tenant keeps every IntegrationLink, which is the whole
 * point: without them the next sync would push every invoice the shop has ever
 * issued a second time.
 *
 * Connecting a DIFFERENT tenant clears them, because the old remote ids point
 * at records in a company this shop no longer syncs with — keeping them would
 * mean silently skipping every customer and invoice as "already pushed" into
 * a company that has never seen one of them.
 * ---------------------------------------------------------------------------
 */
export async function saveConnection(input: {
  shopId: string;
  provider: ProviderName;
  tokens: TokenSet;
  tenantId: string | null;
  tenantName: string | null;
  status: "connected" | "pending";
  settings?: Record<string, unknown>;
}): Promise<void> {
  const existing = await db.integrationConnection.findFirst({
    where: { shopId: input.shopId, provider: input.provider },
    select: { id: true, remoteTenantId: true, remoteTenantName: true, settings: true },
  });

  const switchedTenant =
    existing?.remoteTenantId != null &&
    input.tenantId != null &&
    existing.remoteTenantId !== input.tenantId;

  const settings = {
    ...(switchedTenant
      ? {}
      : ((existing?.settings ?? {}) as Record<string, unknown>)),
    ...(input.settings ?? {}),
    // A fresh grant is never rate limited, and a stale parking stamp would
    // make the first sync after reconnecting do nothing.
    retryAfter: undefined,
  };

  const data = {
    accessToken: input.tokens.accessToken,
    refreshToken: input.tokens.refreshToken,
    expiresAt: input.tokens.expiresAt,
    // A "pending" save carries no tenant yet, and must not erase the one the
    // existing links were built against — the picker compares against it to
    // decide whether those links still mean anything. Syncing is blocked by
    // the pending status either way, so keeping it is inert.
    remoteTenantId: input.tenantId ?? existing?.remoteTenantId ?? null,
    remoteTenantName: input.tenantName ?? existing?.remoteTenantName ?? null,
    status: input.status,
    lastError: null,
    settings: settings as never,
    ...(switchedTenant ? { lastSyncAt: null } : {}),
  };

  if (existing) {
    await db.integrationConnection.update({ where: { id: existing.id }, data });
  } else {
    await db.integrationConnection.create({
      data: { shopId: input.shopId, provider: input.provider, ...data },
    });
  }

  if (switchedTenant) await clearLinks(input.shopId, input.provider);
}

/** Turns a thrown error into the message the settings tab will render. */
export function connectFailure(
  request: Request,
  provider: ProviderName,
  error: unknown,
): NextResponse {
  return backToTab(request, {
    error: "connect-failed",
    provider,
    detail: `${PROVIDER_LABEL[provider]}: ${describe(error)}`.slice(0, 200),
  });
}
