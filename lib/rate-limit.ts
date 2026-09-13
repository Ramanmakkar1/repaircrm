/**
 * Fixed-window rate limiting, in memory.
 *
 * Deliberately process-local: RepairPilot runs as a single Node server, and the
 * things being limited here (a forgotten-password email, a login attempt, a
 * 2FA code) are all cheap to re-try honestly and expensive to brute-force. A
 * Redis dependency would buy multi-instance accuracy at the cost of another
 * service to run, which is a trade a one-box shop app should not make yet.
 *
 * Counters reset when the server restarts. That is a deliberate, documented
 * property, not a bug: a deploy is not an attack window worth engineering for.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Buckets are only swept when the map gets big, so the common path is O(1). */
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  /** False once the window's allowance is spent. */
  allowed: boolean;
  /** Attempts left in this window, after counting the current one. */
  remaining: number;
  /** Milliseconds until the window resets. */
  retryAfterMs: number;
  /** How many attempts have been made in this window, including this one. */
  count: number;
};

/**
 * Counts one attempt against `key` and reports whether it is allowed.
 *
 * Call it once per attempt — it is the counter, not a read-only check.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterMs: Math.max(0, bucket.resetAt - now),
    count: bucket.count,
  };
}

/** Forgets a key — used after a success, so one good password clears the slate. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** "in about 12 minutes" / "in a moment", for a message a shop owner reads. */
export function retryAfterLabel(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  if (minutes <= 1) return "in a minute";
  return `in about ${minutes} minutes`;
}
