import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Daily caps on the AI features, which are paid per request on the platform's
 * own key.
 *
 * Signup is open, so without a cap one bored visitor with a loop — or one
 * stuck retry in a browser tab — becomes the platform's OpenAI bill. Two
 * ceilings, both counted in Postgres (lib/rate-limit.ts is per-isolate memory,
 * which on Workers means "per few seconds of one colo", i.e. no limit at all):
 *
 *   - per shop, per kind, per UTC day — generous for a real counter, tiny for
 *     an abuser;
 *   - platform-wide, all kinds together — the hard stop on the bill however
 *     many throwaway shops somebody signs up.
 *
 * Counted BEFORE the provider is called, so a refused request costs nothing,
 * and a request that then fails at the provider still counts: a failure loop
 * is exactly the thing being capped.
 */

export type AiKind = "text" | "audio" | "vision";

/** Per shop, per day. A busy counter uses a fraction of these. */
export const SHOP_DAILY_LIMIT: Record<AiKind, number> = {
  text: 400,
  audio: 200,
  vision: 100,
};

function platformDailyLimit(): number {
  const raw = Number(process.env.AI_PLATFORM_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

const PLATFORM = "*";

export type QuotaResult = { ok: true } | { ok: false; reason: string };

/** Adds one to a counter and returns the new total. Safe under concurrency. */
async function bump(shopId: string, key: string, day: string): Promise<number> {
  const where = { shopId_key_day: { shopId, key, day } };
  try {
    const row = await db.usageCounter.upsert({
      where,
      create: { shopId, key, day, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return row.count;
  } catch (error) {
    // Two first-requests-of-the-day racing on the insert: the loser's create
    // hits the primary key. The row now exists, so increment it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await db.usageCounter.update({
        where,
        data: { count: { increment: 1 } },
        select: { count: true },
      });
      return row.count;
    }
    throw error;
  }
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Spends one unit of today's allowance, or refuses with a sentence a person at
 * the counter can act on. Call it after the cheap checks (signed in, input not
 * empty) and immediately before the provider.
 */
export async function consumeAiQuota(shopId: string, kind: AiKind): Promise<QuotaResult> {
  const day = utcDay();
  const [shopCount, platformCount] = await Promise.all([
    bump(shopId, `ai.${kind}`, day),
    bump(PLATFORM, "ai.all", day),
  ]);

  if (shopCount > SHOP_DAILY_LIMIT[kind]) {
    return {
      ok: false,
      reason:
        kind === "audio"
          ? "You've used today's voice allowance — typing still works, and voice is back tomorrow."
          : "You've used today's AI allowance for the shop — it resets tomorrow. Everything else works as normal.",
    };
  }
  if (platformCount > platformDailyLimit()) {
    console.error(`[ai-quota] platform daily limit reached (${platformCount})`);
    return {
      ok: false,
      reason: "The assistant is taking a short break — please try again later. Everything else works as normal.",
    };
  }
  return { ok: true };
}
