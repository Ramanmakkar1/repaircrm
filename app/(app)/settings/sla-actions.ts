"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_SLA_HOURS, MIN_SLA_HOURS, readSla } from "@/lib/sla";
import { PRIORITIES, type PriorityKey } from "@/components/tickets/ticket-meta";
import type { SettingsResult } from "@/components/settings/types";

/**
 * Response targets, stored in `Shop.settings.sla` as `{ LOW: 120, ... }`.
 *
 * The write is merge-safe at both levels — the top-level keys this screen
 * knows nothing about (problemTypes, ticketStatuses, automation) survive, and
 * so does any priority the form did not send. `Shop.settings` is a shared blob
 * and a save here must never be a save over somebody else's feature.
 */
export async function updateSlaAction(
  input: Partial<Record<PriorityKey, number>>,
): Promise<SettingsResult> {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { ok: false, error: "Only an owner can change response targets." };
  }

  const patch: Record<string, number> = {};
  for (const priority of PRIORITIES) {
    const raw = input[priority];
    const hours = typeof raw === "number" ? Math.round(raw) : Number.NaN;
    if (!Number.isFinite(hours)) continue;
    if (hours < MIN_SLA_HOURS || hours > MAX_SLA_HOURS) {
      return {
        ok: false,
        error: `Targets must be between ${MIN_SLA_HOURS} and ${MAX_SLA_HOURS} hours.`,
      };
    }
    patch[priority] = hours;
  }

  const shop = await db.shop.findUnique({
    where: { id: session.shopId },
    select: { settings: true },
  });
  if (!shop) return { ok: false, error: "Shop not found." };

  const current = shop.settings;
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

  const next = {
    ...base,
    sla: { ...readSla(current), ...patch },
  } as Prisma.InputJsonValue;

  await db.shop.update({
    where: { id: session.shopId },
    data: { settings: next },
  });

  // The targets decide the due date every new ticket gets.
  revalidatePath("/", "layout");
  return { ok: true };
}
