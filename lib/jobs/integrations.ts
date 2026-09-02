import { connectedProviders, syncShop } from "@/lib/integrations/sync";
import { PROVIDER_LABEL } from "@/lib/integrations/config";
import { syncLine, totalFailed, totalPushed } from "@/lib/integrations/types";

/**
 * Unattended accounting sync — the automation runner's fourth job.
 *
 * A shop that has connected QuickBooks or Xero expects its books to be current
 * without anyone pressing a button, which means the sync has to run on the
 * same timer everything else does. This is the thin adapter between that timer
 * and `syncShop`: one pass per connected provider, counts rolled up, and the
 * first line of any trouble handed back for the run summary.
 *
 * `syncShop` never throws (see lib/integrations/sync.ts), so the loop below
 * cannot take the automation run down with it — the caller in lib/jobs/index.ts
 * still wraps it, because "cannot throw" is a promise this file should not have
 * to be right about forever.
 *
 * A provider that is rate limited or needs reconnecting is not an error worth
 * repeating every fifteen minutes: those states are already on the settings
 * card, in colour, with a button. Only genuine per-row failures are reported
 * upward.
 */
export async function runIntegrationSyncForShop(shopId: string): Promise<{
  pushed: number;
  failed: number;
  errors: string[];
}> {
  const providers = await connectedProviders(shopId);
  if (providers.length === 0) return { pushed: 0, failed: 0, errors: [] };

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const provider of providers) {
    const result = await syncShop(shopId, provider);
    pushed += totalPushed(result);
    failed += totalFailed(result);

    if (totalFailed(result) > 0) {
      errors.push(
        `${PROVIDER_LABEL[provider]}: ${result.errors[0] ?? syncLine(result)}`,
      );
    }
  }

  return { pushed, failed, errors };
}
