"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newSplitformsToken, readSplitforms } from "@/lib/splitforms";

/**
 * Owner-only: connecting a lead source to the shop is a setup decision, and the
 * webhook link is a credential. Every action re-reads the shop from the session
 * and merges into Shop.settings rather than replacing it.
 */

export type SplitformsActionResult = { ok: true; message: string } | { ok: false; error: string };

async function ownerShop() {
  const session = await requireUser();
  if (session.role !== "OWNER") return { session, shop: null, denied: "Only the shop owner can change this." };
  const shop = await db.shop.findUnique({ where: { id: session.shopId }, select: { settings: true } });
  return { session, shop, denied: shop ? null : "Shop not found." };
}

function merged(settings: unknown, splitforms: unknown): Prisma.InputJsonValue {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return { ...(base as Record<string, unknown>), splitforms } as Prisma.InputJsonValue;
}

export async function connectSplitformsAction(): Promise<SplitformsActionResult> {
  const { session, shop, denied } = await ownerShop();
  if (denied || !shop) return { ok: false, error: denied ?? "Shop not found." };

  const existing = readSplitforms(shop.settings);
  if (existing) return { ok: true, message: "Your Splitforms link is ready." };

  await db.shop.update({
    where: { id: session.shopId },
    data: {
      settings: merged(shop.settings, {
        token: newSplitformsToken(),
        secret: null,
        connectedAt: new Date().toISOString(),
        lastLeadAt: null,
      }),
    },
  });
  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "settings.updated",
    entity: "settings",
    entityId: session.shopId,
    summary: "Splitforms lead link created",
    meta: { section: "splitforms" },
  });
  revalidatePath("/leads");
  return { ok: true, message: "Your Splitforms link is ready — paste it into your form's webhook." };
}

/** Optional: the webhook's signing secret, so unsigned requests are refused. Empty clears it. */
export async function saveSplitformsSecretAction(secret: string): Promise<SplitformsActionResult> {
  const { session, shop, denied } = await ownerShop();
  if (denied || !shop) return { ok: false, error: denied ?? "Shop not found." };
  const config = readSplitforms(shop.settings);
  if (!config) return { ok: false, error: "Create your Splitforms link first." };

  const value = String(secret ?? "").trim();
  if (value && (value.length < 16 || value.length > 200)) {
    return { ok: false, error: "That doesn't look like a Splitforms signing secret — copy it again from the webhook." };
  }

  await db.shop.update({
    where: { id: session.shopId },
    data: { settings: merged(shop.settings, { ...config, secret: value || null }) },
  });
  revalidatePath("/leads");
  return {
    ok: true,
    message: value ? "Saved. Only signed Splitforms requests are accepted now." : "Signing secret removed.",
  };
}

/** A new link. The old one stops working at once — for a link that leaked. */
export async function resetSplitformsLinkAction(): Promise<SplitformsActionResult> {
  const { session, shop, denied } = await ownerShop();
  if (denied || !shop) return { ok: false, error: denied ?? "Shop not found." };
  const config = readSplitforms(shop.settings);
  if (!config) return { ok: false, error: "There's no Splitforms link to reset." };

  await db.shop.update({
    where: { id: session.shopId },
    data: { settings: merged(shop.settings, { ...config, token: newSplitformsToken() }) },
  });
  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: "settings.updated",
    entity: "settings",
    entityId: session.shopId,
    summary: "Splitforms lead link reset",
    meta: { section: "splitforms" },
  });
  revalidatePath("/leads");
  return { ok: true, message: "New link made. Paste it into your Splitforms webhook — the old one no longer works." };
}
