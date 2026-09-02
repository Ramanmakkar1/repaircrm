import { db } from "@/lib/db";

import {
  PROVIDERS,
  PROVIDER_LABEL,
  providerConfigured,
  providerEnvVars,
  redirectUri,
} from "./config";
import { linkCounts } from "./links";
import { readSettings } from "./oauth";
import {
  DEFAULT_BANK_ACCOUNT_CODE,
  DEFAULT_SALES_ACCOUNT_CODE,
} from "./xero";
import type { ConnectionStatus, IntegrationCard } from "./types";

/**
 * Everything the Integrations tab renders, for one shop.
 *
 * Read on the server and handed down as plain props. Note what is NOT here:
 * no access token, no refresh token, no client secret. Only whether each env
 * var is populated crosses to the browser, exactly as the Messaging tab does
 * it — an accounting refresh token is a shop's entire ledger.
 */
export async function loadIntegrationCards(
  shopId: string,
): Promise<IntegrationCard[]> {
  const connections = await db.integrationConnection.findMany({
    where: { shopId },
    select: {
      provider: true,
      status: true,
      remoteTenantName: true,
      lastSyncAt: true,
      lastError: true,
      settings: true,
    },
  });

  const byProvider = new Map(connections.map((row) => [row.provider, row]));

  return Promise.all(
    PROVIDERS.map(async (provider): Promise<IntegrationCard> => {
      const row = byProvider.get(provider);
      const settings = readSettings(row?.settings);
      const linked = await linkCounts(shopId, provider);

      return {
        provider,
        label: PROVIDER_LABEL[provider],
        configured: providerConfigured(provider),
        envVars: providerEnvVars(provider),
        redirectUri: redirectUri(provider),
        status: (row?.status as ConnectionStatus | undefined) ?? "none",
        tenantName: row?.remoteTenantName ?? null,
        lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
        lastError: row?.lastError ?? null,
        lastSummary: settings.lastSummary ?? null,
        linked,
        salesAccountCode:
          settings.xeroSalesAccountCode ?? DEFAULT_SALES_ACCOUNT_CODE,
        bankAccountCode:
          settings.xeroBankAccountCode ?? DEFAULT_BANK_ACCOUNT_CODE,
        tenantChoices:
          row?.status === "pending" ? (settings.xeroTenants ?? []) : [],
      };
    }),
  );
}
