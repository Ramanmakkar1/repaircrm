import { db } from "@/lib/db";
import {
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
} from "@/components/settings/webhook-meta";

/**
 * The webhook delivery worker.
 *
 * `emitEvent` (lib/events.ts) queues rows; this drains them. Splitting the two
 * is the whole design: a Server Action finishing a ticket update must not wait
 * on somebody's Zapier endpoint, and a 30-second timeout on their side must not
 * become a 30-second timeout on the counter.
 *
 * ---------------------------------------------------------------------------
 * THE REQUEST
 * ---------------------------------------------------------------------------
 *   POST <hook.url>
 *   Content-Type: application/json
 *   User-Agent: RepairFlow-Webhooks/1
 *   X-RepairFlow-Event: invoice.paid
 *   X-RepairFlow-Delivery: <delivery id>
 *   X-RepairFlow-Signature: t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${body}`>
 *
 * The signature covers the timestamp AND the body, so a captured request
 * cannot be replayed tomorrow with a fresh timestamp, and the body cannot be
 * edited without breaking the digest. It is the same construction Stripe uses,
 * which means a consumer can reuse verification code they may already have.
 * `X-RepairFlow-Delivery` is the idempotency key: a redelivered attempt repeats
 * it, so a consumer can dedupe.
 *
 * ---------------------------------------------------------------------------
 * SUCCESS, FAILURE, RETRIES
 * ---------------------------------------------------------------------------
 * Any 2xx is success. Everything else — a 500, a 404, a DNS failure, a timeout
 * — increments `attempts` and schedules the next try at 1m, 5m, 30m, 2h, 12h.
 * After the last one the row is marked `failed` and left alone; it stays
 * visible in Settings with its final status code so an operator can see what
 * their endpoint said, and can press Retry once they have fixed it.
 *
 * A 4xx is retried like any other failure. It is tempting to give up
 * immediately on a 400 — but the commonest 4xx in practice is a 401 from an
 * endpoint whose auth was misconfigured for ten minutes, and burning the
 * retries on it would lose real events.
 */

/** How many deliveries one pass will attempt. */
const BATCH_SIZE = 100;

/** A slow endpoint is abandoned rather than allowed to eat the whole pass. */
const TIMEOUT_MS = 10_000;

export const USER_AGENT = "RepairFlow-Webhooks/1";

export type WebhookRunResult = { delivered: number; failed: number };

/**
 * Signs a body the way a consumer must verify it.
 *
 * Exported because it is also what the "Verifying signatures" snippet in
 * Settings describes, and because a test needs to be able to produce a valid
 * header without reaching into the worker.
 *
 * WEB CRYPTO, NOT `node:crypto`, and the reason is not style: this module is
 * reachable from instrumentation.ts, which Next compiles for the Edge runtime
 * as well as for Node. A `node:crypto` import there is a build warning on every
 * request. `crypto.subtle` is present in both runtimes and costs only that the
 * function has to be async.
 */
export async function signBody(
  body: string,
  secret: string,
  timestampSeconds: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestampSeconds}.${body}`),
  );

  const digest = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `t=${timestampSeconds},v1=${digest}`;
}

/** Minutes until the next attempt after `attempts` failures, or null when done. */
export function backoffMinutes(attempts: number): number | null {
  // attempts is the count INCLUDING the one that just failed, so attempt 1
  // waits RETRY_BACKOFF_MINUTES[0].
  return RETRY_BACKOFF_MINUTES[attempts - 1] ?? null;
}

/**
 * Delivers every pending row for one shop that is due now.
 *
 * Rows are taken oldest-first so a backlog drains in the order the events
 * happened — a consumer that rebuilds state from the stream sees
 * `ticket.created` before `ticket.resolved`.
 */
export async function runDueWebhookDeliveries(
  shopId: string,
): Promise<WebhookRunResult> {
  const due = await db.webhookDelivery.findMany({
    where: { shopId, status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      event: true,
      payload: true,
      attempts: true,
      webhook: { select: { id: true, url: true, secret: true, active: true } },
    },
  });

  let delivered = 0;
  let failed = 0;

  for (const row of due) {
    // A hook disabled after the event was queued: stop trying, but keep the
    // row so the operator can see what was dropped and why.
    if (!row.webhook.active) {
      await db.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "failed",
          lastError: "webhook is disabled",
          lastAttemptAt: new Date(),
        },
      });
      failed += 1;
      continue;
    }

    const outcome = await attempt({
      deliveryId: row.id,
      event: row.event,
      payload: row.payload,
      url: row.webhook.url,
      secret: row.webhook.secret,
    });

    const attempts = row.attempts + 1;

    if (outcome.ok) {
      await db.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "delivered",
          attempts,
          responseCode: outcome.code,
          lastError: null,
          lastAttemptAt: new Date(),
        },
      });
      delivered += 1;
      continue;
    }

    const wait = attempts >= MAX_DELIVERY_ATTEMPTS ? null : backoffMinutes(attempts);

    await db.webhookDelivery.update({
      where: { id: row.id },
      data: {
        status: wait === null ? "failed" : "pending",
        attempts,
        responseCode: outcome.code ?? null,
        lastError: outcome.reason,
        lastAttemptAt: new Date(),
        nextAttemptAt:
          wait === null ? new Date() : new Date(Date.now() + wait * 60_000),
      },
    });

    failed += 1;
  }

  return { delivered, failed };
}

type Attempt =
  | { ok: true; code: number }
  | { ok: false; code?: number; reason: string };

/**
 * One POST. Never throws — a DNS failure and a 500 are the same kind of fact to
 * the caller above, which has a whole batch left to get through.
 */
async function attempt(input: {
  deliveryId: string;
  event: string;
  payload: unknown;
  url: string;
  secret: string;
}): Promise<Attempt> {
  // The body is serialised ONCE and both signed and sent as that exact string.
  // Re-stringifying for the signature would risk a different key order and a
  // digest the consumer cannot reproduce.
  const body = JSON.stringify(input.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-RepairFlow-Event": input.event,
        "X-RepairFlow-Delivery": input.deliveryId,
        "X-RepairFlow-Signature": await signBody(body, input.secret, timestamp),
      },
      body,
      // No redirects: a 302 to an attacker-chosen host would forward a signed
      // body somewhere the shop never subscribed.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) return { ok: true, code: response.status };

    // The endpoint's own words, trimmed hard — this is going in a table cell.
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      code: response.status,
      reason: short(`HTTP ${response.status} ${detail}`),
    };
  } catch (error) {
    return { ok: false, reason: short(message(error)) };
  }
}

function message(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError"
      ? `no response within ${TIMEOUT_MS / 1000}s`
      : error.message;
  }
  return String(error);
}

function short(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}
