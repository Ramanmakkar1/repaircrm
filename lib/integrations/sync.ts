import { db } from "@/lib/db";

import { PROVIDER_LABEL, providerConfigured, type ProviderName } from "./config";
import {
  IntegrationAuthError,
  IntegrationRateLimitError,
  describe,
  mergeConnectionSettings,
  readSettings,
  withConnection,
} from "./oauth";
import { syncQuickBooks } from "./quickbooks";
import { syncXero } from "./xero";
import { emptySyncResult, totalFailed, type SyncResult } from "./types";

/**
 * One sync pass for one shop and one provider.
 *
 * NEVER THROWS. The three callers — the "Sync now" button, the automation
 * runner and the wizard — all need a result they can render, not an exception:
 * a shop whose QuickBooks token expired overnight must see "reconnect
 * required" on its settings card, not a 500.
 *
 * ---------------------------------------------------------------------------
 * THE WATERMARK, AND WHEN IT MOVES
 * ---------------------------------------------------------------------------
 * `IntegrationConnection.lastSyncAt` is the "everything before this is done"
 * mark. It advances to the instant this pass STARTED (not finished), so a row
 * edited while the pass was running is picked up next time rather than falling
 * between the two clocks.
 *
 * It advances ONLY on a clean pass. If any row failed, or the provider rate
 * limited us, the mark stays put and the next pass looks at the same window
 * again — the link table makes re-examining those rows cheap and re-pushing
 * them impossible. A watermark that moved past a failure would lose the row
 * silently, which is the one outcome an accounting sync may not have.
 * ---------------------------------------------------------------------------
 */
export async function syncShop(
  shopId: string,
  provider: ProviderName,
): Promise<SyncResult> {
  const startedAt = new Date();
  const result = emptySyncResult(provider);
  result.ranAt = startedAt.toISOString();

  if (!providerConfigured(provider)) {
    result.stopped = "not-connected";
    result.errors.push(
      `${PROVIDER_LABEL[provider]} is not configured on this server.`,
    );
    result.ms = Date.now() - startedAt.getTime();
    return result;
  }

  const connection = await db.integrationConnection.findFirst({
    where: { shopId, provider },
    select: { id: true, status: true, settings: true },
  });

  if (!connection || connection.status === "disconnected") {
    result.stopped = "not-connected";
    result.ms = Date.now() - startedAt.getTime();
    return result;
  }
  if (connection.status === "pending") {
    result.stopped = "not-connected";
    result.errors.push("Pick which Xero organisation to sync with first.");
    result.ms = Date.now() - startedAt.getTime();
    return result;
  }

  // A 429 parks the connection until the window the provider named. Starting
  // anyway would burn the next request on another 429 and push the window out.
  const settings = readSettings(connection.settings);
  if (settings.retryAfter && Date.parse(settings.retryAfter) > Date.now()) {
    result.stopped = "rate-limited";
    result.retryAfter = settings.retryAfter;
    result.ms = Date.now() - startedAt.getTime();
    return result;
  }

  try {
    const ran = await withConnection(shopId, provider, async (live) => {
      if (provider === "quickbooks") {
        await syncQuickBooks(live, result, live.lastSyncAt);
      } else {
        await syncXero(live, result, live.lastSyncAt);
      }
      return true;
    });

    if (!ran) {
      result.stopped = "not-connected";
      result.ms = Date.now() - startedAt.getTime();
      return result;
    }
  } catch (error) {
    if (error instanceof IntegrationRateLimitError) {
      result.stopped = "rate-limited";
      result.retryAfter = new Date(
        Date.now() + error.retryAfterMs,
      ).toISOString();
    } else if (error instanceof IntegrationAuthError) {
      result.stopped = "auth";
    }
    result.errors.push(describe(error));
  }

  result.ms = Date.now() - startedAt.getTime();

  const clean = !result.stopped && totalFailed(result) === 0;

  try {
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        ...(clean ? { lastSyncAt: startedAt } : {}),
        lastError: result.errors[0] ?? null,
      },
    });
    await mergeConnectionSettings(shopId, provider, {
      lastSummary: result,
      retryAfter: result.retryAfter,
    });
  } catch (error) {
    result.errors.push(`could not record the run: ${describe(error)}`);
  }

  return result;
}

/**
 * Every provider this shop has actually connected.
 * Used by the settings action and the automation runner, which both want
 * "what is there to sync?" rather than "what could exist?".
 */
export async function connectedProviders(
  shopId: string,
): Promise<ProviderName[]> {
  const rows = await db.integrationConnection.findMany({
    where: { shopId, status: { in: ["connected", "error"] } },
    select: { provider: true },
  });
  return rows
    .map((row) => row.provider)
    .filter((provider): provider is ProviderName =>
      provider === "quickbooks" || provider === "xero",
    );
}
