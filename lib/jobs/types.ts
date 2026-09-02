/**
 * Shared vocabulary for the automation scheduler.
 *
 * Pure — imported by the runner (server), the cron route and the Automation
 * settings tab (client), so this file must stay free of `db`, `next/*` and
 * "use server".
 */

/** Who asked for this run. Recorded so a surprise invoice can be traced. */
export type JobSource = "interval" | "cron-endpoint" | "manual";

export const JOB_SOURCE_LABEL: Record<JobSource, string> = {
  interval: "Automatic (in-app timer)",
  "cron-endpoint": "External cron",
  manual: "Run now button",
};

/**
 * Why a run did no work. Absent on a normal run.
 *
 *   in-process  another run is already going in THIS process (the mutex).
 *   recent-run  the database says a run started moments ago, most likely in
 *               another process (the soft guard — see lib/jobs/index.ts).
 */
export type JobSkipReason = "in-process" | "recent-run";

export type JobsSummary = {
  /** ISO 8601 UTC. */
  startedAt: string;
  /** Wall-clock duration of the whole run. */
  ms: number;
  /** How many shops were visited. */
  shops: number;
  recurring: { created: number };
  /**
   * Cards charged automatically off recurring schedules. `attempted` counts
   * schedules with auto-charge on whose invoice was raised this pass, so
   * attempted − succeeded − failed is always zero and a run that charged
   * nothing is visibly different from a run that charged and was declined.
   */
  charges: { attempted: number; succeeded: number; failed: number };
  campaigns: { queued: number; sent: number; failed: number };
  /** Tickets newly stamped as past due, and alerts actually delivered. */
  sla: { breached: number; notified: number };
  /** Outbound webhook deliveries attempted this pass (lib/jobs/webhooks.ts). */
  webhooks: { delivered: number; failed: number };
  /** Appointment reminders that reached a provider (lib/jobs/appointments.ts). */
  reminders: { sent: number };
  /** Post-pickup review requests that reached a provider (lib/jobs/reviews.ts). */
  reviews: { sent: number };
  /** Rows written to QuickBooks / Xero, across every connected provider. */
  accounting: { pushed: number; failed: number };
  tokensPurged: number;
  /** Dead phone-scanner pairings swept (lib/jobs/housekeeping.ts). */
  scanSessionsPurged: number;
  /**
   * One line per failure, already prefixed with the shop it came from. A run
   * that fills this is still a successful run: every other shop was processed.
   */
  errors: string[];
  source: JobSource;
  /** Set only when the run declined to start. All counters are then zero. */
  skipped?: JobSkipReason;
};

/**
 * What gets written into `Shop.settings.automation`.
 *
 * The last run only — the rolling history lives in the in-memory ring buffer
 * (see lib/jobs/index.ts), because twenty summaries per shop in a Json column
 * is a log file in the wrong place.
 */
export type AutomationSettings = {
  /** Stamped when a run begins. Feeds the soft cross-process guard. */
  lastStartedAt?: string;
  /** Stamped when it ends, successfully or not. */
  lastFinishedAt?: string;
  /** Alias of lastFinishedAt, kept for the settings screen's "last run". */
  lastRunAt?: string;
  lastSource?: JobSource;
  lastSummary?: JobsSummary;
};

export function emptySummary(source: JobSource): JobsSummary {
  return {
    startedAt: new Date().toISOString(),
    ms: 0,
    shops: 0,
    recurring: { created: 0 },
    charges: { attempted: 0, succeeded: 0, failed: 0 },
    campaigns: { queued: 0, sent: 0, failed: 0 },
    sla: { breached: 0, notified: 0 },
    webhooks: { delivered: 0, failed: 0 },
    reminders: { sent: 0 },
    reviews: { sent: 0 },
    accounting: { pushed: 0, failed: 0 },
    tokensPurged: 0,
    scanSessionsPurged: 0,
    errors: [],
    source,
  };
}

/** The one-line form used for the server log and the tab's summary row. */
export function summaryLine(summary: JobsSummary): string {
  if (summary.skipped) {
    return `skipped (${summary.skipped})`;
  }
  return [
    `${summary.shops} shop${summary.shops === 1 ? "" : "s"}`,
    `${summary.recurring.created} invoice${summary.recurring.created === 1 ? "" : "s"}`,
    // Optional-chained: a summary stored by an older build has no `charges` key.
    `${summary.charges?.succeeded ?? 0}/${summary.charges?.attempted ?? 0} charged`,
    `${summary.campaigns.queued} queued`,
    `${summary.campaigns.sent} sent`,
    `${summary.campaigns.failed} failed`,
    // Optional-chained: a summary stored by an older build has no `sla` key.
    `${summary.sla?.breached ?? 0} overdue`,
    // `?? 0` because a summary stored by an older build has no `webhooks` key,
    // and the settings screen replays those stored blobs verbatim.
    `${summary.webhooks?.delivered ?? 0} hooks delivered`,
    // Same reasoning for the two newest counters.
    `${summary.reminders?.sent ?? 0} reminder${(summary.reminders?.sent ?? 0) === 1 ? "" : "s"}`,
    `${summary.reviews?.sent ?? 0} review${(summary.reviews?.sent ?? 0) === 1 ? "" : "s"}`,
    // Same reasoning again for the accounting counter.
    `${summary.accounting?.pushed ?? 0} synced`,
    `${summary.tokensPurged} token${summary.tokensPurged === 1 ? "" : "s"} purged`,
    // `?? 0` again: summaries stored before Wave 9 have no pairing counter.
    `${summary.scanSessionsPurged ?? 0} pairing${(summary.scanSessionsPurged ?? 0) === 1 ? "" : "s"} purged`,
    `${summary.ms}ms`,
  ].join(", ");
}
