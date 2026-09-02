import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { runDueCampaignSends, syncCampaignSends } from "@/app/(app)/marketing/engine";
import { purgeExpiredPortalTokens } from "./housekeeping";
import { runIntegrationSyncForShop } from "./integrations";
import { runDueRecurringInvoicesForShop } from "./recurring";
import {
  emptySummary,
  summaryLine,
  type AutomationSettings,
  type JobSource,
  type JobsSummary,
} from "./types";

export type { JobSource, JobsSummary, AutomationSettings };
export { summaryLine };

/**
 * The automation runner: the one place that decides what runs unattended.
 *
 * Three jobs, per shop, in this order:
 *
 *   1. recurring invoices  stamp a DRAFT invoice out of every schedule whose
 *                          date has arrived (lib/jobs/recurring.ts)
 *   2. campaigns           sync the queue, then send what is due
 *                          (app/(app)/marketing/engine.ts, called directly —
 *                          those are plain functions taking a shopId)
 *   3. accounting          push customers, items, invoices and payments to
 *                          QuickBooks / Xero (lib/jobs/integrations.ts) —
 *                          after recurring, so an invoice stamped this pass
 *                          reaches the books in the same pass
 *   4. housekeeping        drop portal tokens expired for over a week
 *
 * Order matters only between 2a and 2b: syncing first means an event that
 * qualified since the last pass can go out in the same pass rather than
 * waiting fifteen more minutes.
 *
 * THREE CALLERS, ONE FUNCTION. instrumentation.ts (a timer), the cron route
 * handler (an external pinger), and the "Run all jobs now" button all land
 * here. `source` is recorded so the audit trail can tell them apart.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE HISTORY LIVES — a deliberate split
 * ---------------------------------------------------------------------------
 *   Ring buffer (in memory, below)   the last 20 summaries, full detail,
 *                                    process-local, lost on restart.
 *   Shop.settings.automation (Json)  the LAST run only, per shop, survives a
 *                                    restart and a redeploy.
 *
 * Neither alone is enough: the buffer would vanish on every deploy, and twenty
 * summaries per shop in a Json column is a log file living in the wrong place.
 * The settings tab reads both and prefers the buffer when it has something,
 * because the buffer is the only one that can show a *sequence*.
 * ---------------------------------------------------------------------------
 */

/** How many summaries the in-memory ring buffer keeps. */
export const RING_SIZE = 20;

/**
 * A run whose DB stamp is younger than this is assumed to still be going, and
 * a second run declines to start. See the guard's limits in `recentlyStarted`.
 */
const STALE_RUN_MS = 2 * 60 * 1000;

/**
 * State that must survive a dev-server hot reload, kept on globalThis for the
 * same reason lib/db.ts keeps the Prisma client there: a module re-evaluation
 * would otherwise hand out a second mutex and let two runs overlap.
 */
const globalForJobs = globalThis as unknown as {
  rfJobsRunning?: Promise<JobsSummary> | null;
  rfJobsRing?: JobsSummary[];
};

globalForJobs.rfJobsRing ??= [];

/** The last `RING_SIZE` summaries, newest first. */
export function recentRuns(): JobsSummary[] {
  return [...(globalForJobs.rfJobsRing ?? [])];
}

/** True while a run is in flight in THIS process. */
export function isRunning(): boolean {
  return Boolean(globalForJobs.rfJobsRunning);
}

function remember(summary: JobsSummary): void {
  const ring = (globalForJobs.rfJobsRing ??= []);
  ring.unshift(summary);
  if (ring.length > RING_SIZE) ring.length = RING_SIZE;
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

/**
 * Reads `Shop.settings.automation`, tolerating every shape the column can
 * legally hold (null, a scalar, an array, an object without the key).
 */
export function readAutomation(
  settings: Prisma.JsonValue | null | undefined,
): AutomationSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const value = (settings as Record<string, unknown>).automation;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as AutomationSettings;
}

/**
 * Merges a patch into `settings.automation` WITHOUT discarding anything else.
 *
 * `settings` is a blob shared with the Workflow tab (problemTypes,
 * ticketStatuses) and with whatever a future feature parks there. Two levels
 * are therefore preserved: the top-level keys this job knows nothing about,
 * and the automation keys within it that this particular write is not setting.
 *
 * A read-modify-write on a Json column is not atomic. Two runs stamping the
 * same shop in the same millisecond could lose one of the two stamps — which
 * is why the mutex and the soft guard exist above, and why nothing anyone
 * relies on is stored here beyond the last run's report card.
 */
function mergeAutomation(
  current: Prisma.JsonValue | null | undefined,
  patch: AutomationSettings,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

  return {
    ...base,
    automation: { ...readAutomation(current), ...patch },
  } as Prisma.InputJsonValue;
}

/**
 * Re-reads the shop's settings immediately before writing.
 *
 * The copy loaded at the top of the run is already seconds stale by the time a
 * shop finishes — an operator renaming a problem type mid-run would have their
 * change overwritten by a merge against the older blob. Re-reading shrinks
 * that window to the width of a single statement.
 */
async function stampAutomation(
  shopId: string,
  patch: AutomationSettings,
): Promise<void> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  if (!shop) return;

  await db.shop.update({
    where: { id: shopId },
    data: { settings: mergeAutomation(shop.settings, patch) },
  });
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Best-effort cross-process guard.
 *
 * True when some shop was stamped as started less than two minutes ago and has
 * no finish stamp at or after that start — i.e. a run looks live somewhere.
 *
 * LIMITS, stated plainly. This is not a lock:
 *
 *   - It is a read followed by a write, so two processes checking at the same
 *     instant both see "clear" and both proceed. The real protection against
 *     double-sending is downstream: the campaign engine claims each row with
 *     an atomic compare-and-set, and each invoice moves `nextRunAt` inside its
 *     own transaction. This guard only spares the database pointless work.
 *   - A process killed mid-run leaves a start with no finish. Rather than
 *     wedging automation forever, the stamp simply ages out after two minutes
 *     and the next pass proceeds.
 *   - Consequently a genuine run lasting over two minutes is no longer
 *     protected by it. That is the deliberate trade: a stuck lock is worse
 *     than an overlapping run the downstream claims already handle.
 */
function recentlyStarted(
  shops: { settings: Prisma.JsonValue | null }[],
  now: number,
): boolean {
  return shops.some((shop) => {
    const automation = readAutomation(shop.settings);
    if (!automation.lastStartedAt) return false;

    const started = Date.parse(automation.lastStartedAt);
    if (Number.isNaN(started)) return false;
    if (now - started >= STALE_RUN_MS) return false;

    const finished = automation.lastFinishedAt
      ? Date.parse(automation.lastFinishedAt)
      : NaN;
    // Finished at or after it started -> that run is over, nothing is live.
    return Number.isNaN(finished) || finished < started;
  });
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/**
 * Runs every job for every shop and returns what happened.
 *
 * NEVER THROWS. Callers include a timer with nowhere to report an error and a
 * route handler that must answer with JSON either way, so a failure is always
 * a summary with `errors` filled in rather than a rejected promise.
 *
 * Each shop is wrapped individually: one tenant's broken schedule cannot stop
 * the next tenant's billing.
 */
export async function runAllJobs(source: JobSource): Promise<JobsSummary> {
  // In-process mutex. A second caller does not queue behind the first — it is
  // told the run was skipped, which is honest: an interval tick that arrives
  // mid-run has nothing to add, and the caller gets its own summary rather
  // than a report of somebody else's work.
  if (globalForJobs.rfJobsRunning) {
    return { ...emptySummary(source), skipped: "in-process" };
  }

  const run = execute(source);
  globalForJobs.rfJobsRunning = run;
  try {
    return await run;
  } finally {
    globalForJobs.rfJobsRunning = null;
  }
}

async function execute(source: JobSource): Promise<JobsSummary> {
  const startedAtMs = Date.now();
  const summary = emptySummary(source);
  summary.startedAt = new Date(startedAtMs).toISOString();

  try {
    const shops = await db.shop.findMany({
      select: { id: true, name: true, settings: true },
      orderBy: { createdAt: "asc" },
    });

    if (recentlyStarted(shops, startedAtMs)) {
      const skipped: JobsSummary = {
        ...summary,
        ms: Date.now() - startedAtMs,
        skipped: "recent-run",
      };
      remember(skipped);
      return skipped;
    }

    summary.shops = shops.length;

    for (const shop of shops) {
      const startedIso = new Date().toISOString();

      // Stamp the start BEFORE the work, so the guard above has something to
      // see while this run is in flight.
      try {
        await stampAutomation(shop.id, {
          lastStartedAt: startedIso,
          lastSource: source,
        });
      } catch {
        // A settings write failing must not cancel the shop's actual billing.
      }

      try {
        await runShop(shop.id, summary);
      } catch (error) {
        summary.errors.push(`${shop.name}: ${message(error)}`);
      }

      try {
        const finishedIso = new Date().toISOString();
        await stampAutomation(shop.id, {
          lastStartedAt: startedIso,
          lastFinishedAt: finishedIso,
          lastRunAt: finishedIso,
          lastSource: source,
          // The whole-run summary, not this shop's slice. With one shop they
          // are the same thing; with many, every shop's record answers "when
          // did automation last run, and what did it do overall".
          lastSummary: { ...summary, ms: Date.now() - startedAtMs },
        });
      } catch (error) {
        summary.errors.push(`${shop.name}: could not record run (${message(error)})`);
      }
    }
  } catch (error) {
    // The shop list itself failed — the database is down or misconfigured.
    summary.errors.push(`automation: ${message(error)}`);
  }

  summary.ms = Date.now() - startedAtMs;
  remember(summary);
  return summary;
}

/** All four jobs for one shop. Each is isolated so one failure is not four. */
async function runShop(shopId: string, summary: JobsSummary): Promise<void> {
  try {
    const recurring = await runDueRecurringInvoicesForShop(shopId);
    summary.recurring.created += recurring.created;
    for (const error of recurring.errors) {
      summary.errors.push(`recurring: ${error}`);
    }
  } catch (error) {
    summary.errors.push(`recurring: ${message(error)}`);
  }

  try {
    // Phase 1: write one queue row per newly qualifying event...
    const synced = await syncCampaignSends(shopId);
    summary.campaigns.queued += synced.scheduled;

    // ...phase 2: send the rows whose date has arrived. The engine caps each
    // pass at MAX_SENDS_PER_RUN and claims every row with a compare-and-set,
    // so an overlapping run finds nothing to claim rather than double-sending.
    const sent = await runDueCampaignSends(shopId);
    summary.campaigns.sent += sent.sent;
    summary.campaigns.failed += sent.failed;
    if (sent.firstProblem) {
      summary.errors.push(`campaigns: ${sent.firstProblem}`);
    }
  } catch (error) {
    summary.errors.push(`campaigns: ${message(error)}`);
  }

  try {
    // Accounting last: it pushes invoices, and the recurring job above may
    // have just stamped one. Running it first would leave that invoice a pass
    // behind for no reason.
    const accounting = await runIntegrationSyncForShop(shopId);
    summary.accounting.pushed += accounting.pushed;
    summary.accounting.failed += accounting.failed;
    for (const error of accounting.errors) {
      summary.errors.push(`accounting: ${error}`);
    }
  } catch (error) {
    summary.errors.push(`accounting: ${message(error)}`);
  }

  try {
    summary.tokensPurged += await purgeExpiredPortalTokens(shopId);
  } catch (error) {
    summary.errors.push(`housekeeping: ${message(error)}`);
  }
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}
