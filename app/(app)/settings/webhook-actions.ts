"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { runDueWebhookDeliveries } from "@/lib/jobs/webhooks";
import {
  isWebhookEvent,
  WILDCARD_EVENT,
} from "@/components/settings/webhook-meta";
import type {
  CreateWebhookResult,
  SettingsResult,
} from "@/components/settings/types";

/**
 * Outbound webhook management.
 *
 * OWNER ONLY, for the same reason API keys are: a webhook is a standing
 * instruction to send this shop's customer and invoice data to an address of
 * someone's choosing. Front desk manages people's credit, not where the shop's
 * data goes.
 *
 * Like the rest of settings these return an error object rather than calling
 * `requireRole` (which redirects), because the client is awaiting a result and
 * a redirect there surfaces as an opaque failure.
 */

const MAX_WEBHOOKS = 10;

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can manage webhooks." };
  }
  return { session, denied: null as string | null };
}

/**
 * The endpoint must be a real absolute HTTP(S) URL.
 *
 * Plain `http` is allowed because a shop testing against a local script needs
 * it, and refusing it would only push people to disable the feature. It is not
 * a secret channel either way — the signature is what proves the body came from
 * us, not the transport.
 */
function validUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** 32 bytes of CSPRNG, hex. Long enough that guessing it is not a strategy. */
function mintSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

/**
 * Creates a hook and returns its secret ONCE.
 *
 * The secret is stored in the clear — unlike an API key, which is hashed. That
 * is not an oversight: an HMAC signature can only be produced by a party that
 * holds the key, so the server must be able to read it back on every delivery.
 * The mitigation is that it is useless on its own (it authenticates our
 * requests to the consumer, it opens nothing here) and that it is only ever
 * shown to the owner who created it.
 */
export async function createWebhookAction(
  rawUrl: string,
  events: string[],
): Promise<CreateWebhookResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const url = validUrl(rawUrl);
  if (!url) {
    return { ok: false, error: "Enter a full URL, starting with https://" };
  }

  const chosen = events.filter(
    (event) => event === WILDCARD_EVENT || isWebhookEvent(event),
  );
  if (chosen.length === 0) {
    return { ok: false, error: "Pick at least one event to send." };
  }

  const count = await db.webhook.count({ where: { shopId: session.shopId } });
  if (count >= MAX_WEBHOOKS) {
    return {
      ok: false,
      error: `That's ${MAX_WEBHOOKS} endpoints already — delete one you no longer use.`,
    };
  }

  const secret = mintSecret();

  const row = await db.webhook.create({
    data: {
      shopId: session.shopId,
      url,
      secret,
      // "*" alone: subscribing to everything and also listing names would make
      // the checkbox state ambiguous next time it is read back.
      events: chosen.includes(WILDCARD_EVENT) ? [WILDCARD_EVENT] : chosen,
    },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  revalidatePath("/settings");

  return {
    ok: true,
    secret,
    item: {
      id: row.id,
      url: row.url,
      events: row.events,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export async function setWebhookActiveAction(
  webhookId: string,
  active: boolean,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  // updateMany with the shopId in the where: a guessed id from another shop
  // matches nothing rather than flipping someone else's endpoint.
  const result = await db.webhook.updateMany({
    where: { id: webhookId, shopId: session.shopId },
    data: { active },
  });
  if (result.count === 0) return { ok: false, error: "That endpoint is gone." };

  revalidatePath("/settings");
  return { ok: true };
}

/** Deleting takes the delivery history with it — the rows cascade. */
export async function deleteWebhookAction(
  webhookId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const result = await db.webhook.deleteMany({
    where: { id: webhookId, shopId: session.shopId },
  });
  if (result.count === 0) return { ok: false, error: "That endpoint is gone." };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Queues a `ping` and delivers it immediately.
 *
 * Two things make this the right shape for a test button:
 *
 *   · `ping` is not in the event catalogue and ignores the hook's
 *     subscriptions, so an endpoint subscribed only to `invoice.paid` can still
 *     be tested without inventing a fake invoice.
 *   · The delivery runs inline rather than waiting for the next job pass, so
 *     the operator sees the real status code while they are still looking at
 *     the screen. It is signed and shaped exactly like a real delivery — if the
 *     consumer's verification is wrong, this is where they find out.
 */
export async function sendTestWebhookAction(
  webhookId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const hook = await db.webhook.findFirst({
    where: { id: webhookId, shopId: session.shopId },
    select: { id: true, active: true },
  });
  if (!hook) return { ok: false, error: "That endpoint is gone." };
  if (!hook.active) {
    return { ok: false, error: "Enable the endpoint before testing it." };
  }

  await db.webhookDelivery.create({
    data: {
      shopId: session.shopId,
      webhookId: hook.id,
      event: "ping",
      payload: {
        id: `evt_test_${randomBytes(8).toString("hex")}`,
        event: "ping",
        created: new Date().toISOString(),
        shopId: session.shopId,
        data: { message: "Test event from RepairFlow." },
      },
      status: "pending",
      nextAttemptAt: new Date(),
    },
  });

  await runDueWebhookDeliveries(session.shopId);

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Retries one delivery now.
 *
 * Resets `attempts` to zero so a hook that was fixed after burning its five
 * retries gets a full schedule again rather than one last chance.
 */
export async function retryWebhookDeliveryAction(
  deliveryId: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const result = await db.webhookDelivery.updateMany({
    where: { id: deliveryId, shopId: session.shopId },
    data: {
      status: "pending",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  });
  if (result.count === 0) return { ok: false, error: "That delivery is gone." };

  await runDueWebhookDeliveries(session.shopId);

  revalidatePath("/settings");
  return { ok: true };
}
