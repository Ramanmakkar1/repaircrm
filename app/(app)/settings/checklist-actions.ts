"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_LABEL,
  parseTemplateItems,
} from "@/lib/checklist";
import type { SettingsResult } from "@/components/settings/types";

/**
 * Checklist templates — OWNER only.
 *
 * A template is a name, an optional problem type it auto-attaches for, and an
 * ordered list of steps. Attaching one to a ticket copies the steps across, so
 * editing a template here never rewrites a job already on the bench.
 */

const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the checklist a name.").max(80),
  problemType: z.string().trim().max(60).nullable(),
});

export type ChecklistTemplateInput = {
  id?: string | null;
  name: string;
  /** null = never auto-attach; the tech picks it by hand. */
  problemType?: string | null;
  items: string[];
};

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can manage checklists." };
  }
  return { session, denied: null as string | null };
}

export async function saveChecklistTemplateAction(
  input: ChecklistTemplateInput,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const problemType = (input.problemType ?? "").trim();
  const parsed = templateSchema.safeParse({
    name: input.name,
    problemType: problemType === "" ? null : problemType,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const items = parseTemplateItems(input.items);
  if (items.length === 0) {
    return { ok: false, error: "Add at least one step." };
  }
  if (input.items.length > MAX_CHECKLIST_ITEMS) {
    return {
      ok: false,
      error: `A checklist can hold at most ${MAX_CHECKLIST_ITEMS} steps (each up to ${MAX_CHECKLIST_LABEL} characters).`,
    };
  }

  if (input.id) {
    // updateMany with the shop filter — a forged id matches nothing rather
    // than rewriting another tenant's checklist.
    const updated = await db.checklistTemplate.updateMany({
      where: { id: input.id, shopId: session.shopId },
      data: { ...parsed.data, items },
    });
    if (updated.count === 0) {
      return { ok: false, error: "That checklist no longer exists." };
    }
  } else {
    await db.checklistTemplate.create({
      data: { shopId: session.shopId, ...parsed.data, items },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/tickets");
  return { ok: true };
}

/**
 * Retires a template. Tickets keep the copy of the steps they were given —
 * `Ticket.checklistTemplateId` is SetNull, and the checklist itself lives on
 * the ticket — so nothing on the bench loses its list.
 */
export async function deleteChecklistTemplateAction(
  id: string,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  // Prisma treats `id: undefined` as "no filter"; without this guard a
  // malformed call would delete every template in the shop.
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "That checklist no longer exists." };
  }

  const deleted = await db.checklistTemplate.deleteMany({
    where: { id, shopId: session.shopId },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "That checklist no longer exists." };
  }

  revalidatePath("/settings");
  revalidatePath("/tickets");
  return { ok: true };
}
