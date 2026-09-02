/**
 * Per-key rate limiting for /api/v1.
 *
 * A token bucket: 600 tokens, refilled at 10 per second (600/minute). A burst
 * of 600 is allowed — an integration doing a nightly sync should not be
 * punished for being fast — but the sustained rate cannot exceed a request
 * every 100ms.
 *
 * IN MEMORY, ON PURPOSE — AND ITS LIMIT, STATED
 * ---------------------------------------------
 * The buckets live in this process. Two app instances behind a load balancer
 * therefore allow 1200/min between them rather than 600. That is the honest
 * trade for having no Redis in the stack: the limiter exists to stop one
 * runaway script from flattening the database, and a factor-of-N ceiling still
 * does that. It is not a billing meter, and nothing bills off it.
 *
 * The map is parked on globalThis for the same reason lib/db.ts parks the
 * Prisma client there: a dev-server hot reload re-evaluates this module, and a
 * fresh map would hand every key a full bucket on every code change.
 */

/** Requests per minute per key. */
export const RATE_LIMIT = 600;

/** Bucket capacity == the per-minute allowance, so a full minute can burst. */
const CAPACITY = RATE_LIMIT;

/** Tokens added per millisecond. 600/min = 0.01/ms. */
const REFILL_PER_MS = RATE_LIMIT / 60_000;

/** Buckets untouched for this long are dropped on the next sweep. */
const IDLE_MS = 10 * 60_000;

type Bucket = { tokens: number; updatedAt: number };

const globalForLimit = globalThis as unknown as {
  rfRateBuckets?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> = (globalForLimit.rfRateBuckets ??= new Map());

export type RateDecision = {
  allowed: boolean;
  limit: number;
  /** Whole tokens left after this request. */
  remaining: number;
  /** Unix seconds at which the bucket is full again. */
  reset: number;
  /** Seconds to wait before retrying. Only meaningful when `allowed` is false. */
  retryAfter: number;
};

/**
 * Spends one token for `key`, or reports that there was none to spend.
 *
 * Sweeping happens here rather than on a timer: a timer would keep the process
 * awake for a map that is empty most of the time, and the sweep is O(size) on
 * a map that only holds one entry per active API key.
 */
export function consume(key: string, nowMs: number = Date.now()): RateDecision {
  sweep(nowMs);

  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updatedAt: nowMs };

  // Refill for the elapsed time, capped at capacity.
  const elapsed = Math.max(0, nowMs - bucket.updatedAt);
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.updatedAt = nowMs;

  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;

  buckets.set(key, bucket);

  // When the bucket is full again — the window a client can plan against.
  const msToFull = Math.ceil((CAPACITY - bucket.tokens) / REFILL_PER_MS);
  // When the NEXT token lands, which is what a throttled client actually waits.
  const msToOne = allowed ? 0 : Math.ceil((1 - bucket.tokens) / REFILL_PER_MS);

  return {
    allowed,
    limit: RATE_LIMIT,
    remaining: Math.max(0, Math.floor(bucket.tokens)),
    reset: Math.ceil((nowMs + msToFull) / 1000),
    retryAfter: Math.max(1, Math.ceil(msToOne / 1000)),
  };
}

/** The headers every v1 response carries, throttled or not. */
export function rateHeaders(decision: RateDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.reset),
  };
}

let lastSweep = 0;

function sweep(nowMs: number): void {
  if (nowMs - lastSweep < IDLE_MS) return;
  lastSweep = nowMs;
  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.updatedAt > IDLE_MS) buckets.delete(key);
  }
}

/** Test/dev helper — forgets every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
