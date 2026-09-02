"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isProvider, PROVIDER_LABEL } from "@/lib/integrations/config";
import { clearLinks } from "@/lib/integrations/links";
import { describe, readSettings } from "@/lib/integrations/oauth";
import { revokeQuickBooks } from "@/lib/integrations/quickbooks";
import { syncShop } from "@/lib/integrations/sync";
import { syncLine } from "@/lib/integrations/types";
import type { SettingsResult } from "@/components/settings/types";

/**
 * Integrations mutations.
 *
 * Same rules as the rest of Settings: OWNER only, and `shopId` comes from the
 * session — never from an argument. A hand-rolled POST cannot disconnect
 * another tenant's QuickBooks or read their sync log, because the only shopId
 * this file ever sees is the one in the signed cookie.
 */

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can manage integrations." };
  }
  return { session, denied: null as string | null };
}

/**
 * Disconnects a provider.
 *
 * The QuickBooks refresh token is revoked at Intuit first, best effort: if
 * Intuit is unreachable the local row is still marked disconnected, because a
 * Disconnect button that sometimes silently does nothing is worse than a
 * token that outlives its use by an hour.
 *
 * The IntegrationLinks are deliberately KEPT. Reconnecting the same company
 * must not re-push every invoice the shop has ever issued; they are only
 * cleared when a different company is connected (see lib/integrations/connect.ts).
 */
export async function disconnectIntegrationAction(
  provider: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };
  if (!isProvider(provider)) return { ok: false, error: "Unknown provider." };

  const connection = await db.integrationConnection.findFirst({
    where: { shopId: session.shopId, provider },
    select: { id: true, refreshToken: true },
  });
  if (!connection) return { ok: false, error: "That account is not connected." };

  if (provider === "quickbooks") {
    try {
      await revokeQuickBooks(connection.refreshToken);
    } catch {
      // Revocation is a courtesy to Intuit, not a precondition for us.
    }
  }

  await db.integrationConnection.update({
    where: { id: connection.id },
    data: {
      status: "disconnected",
      // The tokens are useless now and there is no reason to keep a live
      // credential in a row nobody is using.
      accessToken: "",
      refreshToken: "",
      expiresAt: new Date(0),
      lastError: null,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** "Sync now". Returns the one-line summary the card shows in a toast. */
export async function syncNowAction(
  provider: string,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };
  if (!isProvider(provider)) return { ok: false, error: "Unknown provider." };

  const result = await syncShop(session.shopId, provider);

  revalidatePath("/settings");

  if (result.stopped === "auth") {
    return {
      ok: false,
      error: `${PROVIDER_LABEL[provider]} needs reconnecting — ${result.errors[0] ?? "the tokens were rejected"}.`,
    };
  }
  if (result.stopped === "not-connected") {
    return {
      ok: false,
      error: result.errors[0] ?? `${PROVIDER_LABEL[provider]} is not connected.`,
    };
  }

  return { ok: true, summary: `${PROVIDER_LABEL[provider]}: ${syncLine(result)}` };
}

/**
 * Xero's sales and bank account codes.
 *
 * Every Xero organisation numbers its own chart of accounts, so these cannot
 * be constants. Validated as codes rather than free text — Xero rejects
 * anything else at write time, and a rejection three days later on an invoice
 * is a much worse place to find out.
 */
export async function saveXeroAccountCodesAction(input: {
  salesAccountCode: string;
  bankAccountCode: string;
}): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const sales = input.salesAccountCode.trim().toUpperCase();
  const bank = input.bankAccountCode.trim().toUpperCase();
  const shape = /^[A-Z0-9-]{1,10}$/;

  if (!shape.test(sales)) {
    return { ok: false, error: "Sales account code should look like 200." };
  }
  if (!shape.test(bank)) {
    return { ok: false, error: "Bank account code should look like 090." };
  }

  const connection = await db.integrationConnection.findFirst({
    where: { shopId: session.shopId, provider: "xero" },
    select: { id: true, settings: true },
  });
  if (!connection) return { ok: false, error: "Xero is not connected." };

  await db.integrationConnection.update({
    where: { id: connection.id },
    data: {
      settings: {
        ...readSettings(connection.settings),
        xeroSalesAccountCode: sales,
        xeroBankAccountCode: bank,
      } as never,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Commits the Xero organisation an operator picked.
 *
 * The choice is checked against the tenant list stored when the grant came
 * back — an arbitrary tenantId posted at this action is refused, because a
 * tenant this grant does not cover would produce a connection whose every
 * call 403s, days later, for reasons nobody could reconstruct.
 */
export async function chooseXeroTenantAction(
  tenantId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const connection = await db.integrationConnection.findFirst({
    where: { shopId: session.shopId, provider: "xero" },
    select: { id: true, settings: true, status: true, remoteTenantId: true },
  });
  if (!connection) return { ok: false, error: "Xero is not connected." };

  const settings = readSettings(connection.settings);
  const chosen = settings.xeroTenants?.find(
    (tenant) => tenant.tenantId === tenantId,
  );
  if (!chosen) {
    return { ok: false, error: "That organisation is not part of this connection." };
  }

  // Same rule as connecting a different QuickBooks company (see
  // lib/integrations/connect.ts): remote ids from the previous organisation
  // are meaningless here, and keeping them would silently skip every customer
  // and invoice as "already pushed" into books that have never seen one.
  const switchedTenant =
    connection.remoteTenantId !== null &&
    connection.remoteTenantId !== chosen.tenantId;

  try {
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        remoteTenantId: chosen.tenantId,
        remoteTenantName: chosen.tenantName,
        status: "connected",
        lastError: null,
        ...(switchedTenant ? { lastSyncAt: null } : {}),
      },
    });
    if (switchedTenant) await clearLinks(session.shopId, "xero");
  } catch (error) {
    return { ok: false, error: describe(error) };
  }

  revalidatePath("/settings");
  return { ok: true };
}
