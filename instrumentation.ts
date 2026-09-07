/**
 * Next.js instrumentation hook — the in-process automation timer.
 *
 * `register()` is called once when the server boots. It starts a plain
 * `setInterval` that runs the same `runAllJobs()` the cron route and the
 * "Run now" button call, so follow-ups and recurring invoices happen without
 * anyone pressing anything.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS AND IS NOT
 * ---------------------------------------------------------------------------
 * It is a timer inside the web server. That makes it free, dependency-free and
 * correct for a single long-running Node process — which is what this app is
 * today.
 *
 * It stops being enough the moment the app is deployed as more than one
 * instance (every instance would tick), or onto a platform that idles the
 * process between requests (serverless: no process, no timer). Both cases are
 * why app/api/cron/route.ts exists as well: set `CRON_SECRET`, point a real
 * scheduler at it, and set `JOBS_INTERVAL_MIN=0` to switch this timer off.
 * ---------------------------------------------------------------------------
 *
 * ENVIRONMENT
 *   JOBS_INTERVAL_MIN   minutes between runs. Default 15. "0" disables the
 *                       timer entirely (no interval, no first run).
 *   JOBS_FIRST_DELAY_S  seconds to wait before the first run. Default 60 —
 *                       long enough for the database pool and the rest of the
 *                       app to settle before a boot is spent on billing.
 */

const DEFAULT_INTERVAL_MIN = 15;
const DEFAULT_FIRST_DELAY_S = 60;

/**
 * Next may evaluate this module more than once (hot reload in dev, and some
 * server topologies). A flag on globalThis keeps one process to one timer —
 * without it a long dev session would accumulate a scheduler per reload.
 */
const globalForTimer = globalThis as unknown as {
  rfJobsTimerStarted?: boolean;
};

export async function register(): Promise<void> {
  // The Edge runtime has no timers worth the name and no database driver;
  // this hook runs there too, so the guard is required, not decorative.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Before anything else: refuse to serve a deploy that cannot sign a session.
  // See lib/preflight.ts — a missing AUTH_SECRET otherwise boots clean, passes
  // the health check, and 500s every sign-in.
  const { preflight } = await import("@/lib/preflight");
  preflight();

  const intervalMin = readNumber(
    process.env.JOBS_INTERVAL_MIN,
    DEFAULT_INTERVAL_MIN,
  );

  if (intervalMin <= 0) {
    log("in-app timer disabled (JOBS_INTERVAL_MIN=0)");
    return;
  }

  if (globalForTimer.rfJobsTimerStarted) return;
  globalForTimer.rfJobsTimerStarted = true;

  const firstDelayS = readNumber(
    process.env.JOBS_FIRST_DELAY_S,
    DEFAULT_FIRST_DELAY_S,
  );
  const intervalMs = intervalMin * 60_000;

  log(
    `in-app timer on — every ${intervalMin} min, first run in ${firstDelayS}s`,
  );

  // Both timers are unref'd so they can never be the reason the process stays
  // alive. The HTTP server keeps it running; a stray scheduler should not.
  setTimeout(tick, Math.max(firstDelayS, 0) * 1000).unref();
  setInterval(tick, intervalMs).unref();
}

/**
 * One pass. Nothing here is allowed to reject: an unhandled rejection inside a
 * timer callback takes the whole server down on modern Node, which would mean
 * a failing campaign send could kill the app.
 */
async function tick(): Promise<void> {
  try {
    // Imported lazily so booting the Edge runtime — or merely building — never
    // pulls in Prisma and the entire job graph.
    const { runAllJobs, summaryLine } = await import("@/lib/jobs");
    const summary = await runAllJobs("interval");
    log(summaryLine(summary));
  } catch (error) {
    log(`run failed — ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readNumber(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** One line, one prefix — greppable in a deploy log. */
function log(text: string): void {
  console.log(`[jobs] ${text}`);
}
