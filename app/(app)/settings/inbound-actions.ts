"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SettingsResult } from "@/components/settings/types";

/**
 * The shop's inbound address.
 *
 * Stored in `Shop.settings.inboundEmail` and read by the inbound webhook to
 * decide which tenant a message belongs to (see app/api/inbound/_lib/shop.ts).
 * OWNER only: it is the routing rule for other people's mail.
 *
 * `settings` is a blob shared with the Workflow tab and the automation
 * scheduler, so the write MERGES rather than replaces — clobbering it here
 * would silently drop a shop's problem types.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function saveInboundEmailAction(
  raw: string,
): Promise<SettingsResult> {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { ok: false, error: "Only an owner can change the inbound address." };
  }

  const value = raw.trim().toLowerCase();
  // Empty clears it, which switches the shop back to the single-shop fallback.
  if (value && !EMAIL_PATTERN.test(value)) {
    return { ok: false, error: "Enter a full email address, or leave it blank." };
  }
  if (value.length > 160) {
    return { ok: false, error: "That address is too long." };
  }

  const shop = await db.shop.findUnique({
    where: { id: session.shopId },
    select: { settings: true },
  });
  if (!shop) return { ok: false, error: "Shop not found." };

  const base =
    shop.settings && typeof shop.settings === "object" && !Array.isArray(shop.settings)
      ? { ...(shop.settings as Record<string, unknown>) }
      : {};

  await db.shop.update({
    where: { id: session.shopId },
    data: {
      settings: { ...base, inboundEmail: value } as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}
