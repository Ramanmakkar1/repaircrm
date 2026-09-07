"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checklistFromTemplate,
  parseChecklist,
  type ChecklistItem,
} from "@/lib/checklist";
import type { ActionState } from "@/components/tickets/action-state";

/**
 * The checklist on one ticket.
 *
 * `Ticket.checklist` is a Json array of `{ label, done, doneAt }`. It is read,
 * modified and written whole — a checklist is a handful of rows, and a
 * read-modify-write of the entire array is both simpler and immune to a stale
 * index from a client that was looking at an older copy (the label is compared
 * before a tick lands, so a reordered list cannot tick the wrong step).
 *
 * Every action re-reads the ticket with `findFirst({ id, shopId })` first, so
 * an id from another tenant does nothing at all.
 */

async function findTicket(shopId: string, ticketId: string) {
  if (!ticketId) return null;
  return db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: { id: true, checklist: true },
  });
}

function revalidateTicket(ticketId: string): void {
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

/** Ticks or unticks one step, stamping `doneAt` when it is ticked. */
export async function toggleChecklistItemAction(
  ticketId: string,
  index: number,
  label: string,
  done: boolean,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const items = parseChecklist(ticket.checklist);
  const item = items[index];
  if (!item) return { error: "That checklist step is gone — refresh the page." };
  if (item.label !== label) {
    return { error: "The checklist changed while you were looking at it — refresh." };
  }

  items[index] = {
    label: item.label,
    done,
    doneAt: done ? new Date().toISOString() : null,
  };

  await db.ticket.update({
    where: { id: ticket.id },
    data: { checklist: items as unknown as Prisma.InputJsonValue },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/** Copies a template's steps onto the ticket, replacing anything already there. */
export async function attachChecklistAction(
  ticketId: string,
  templateId: string,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const template = await db.checklistTemplate.findFirst({
    where: { id: templateId, shopId, active: true },
    select: { id: true, items: true },
  });
  if (!template) return { error: "That checklist no longer exists." };

  const items = checklistFromTemplate(template.items as string[]);
  if (items.length === 0) return { error: "That checklist has no steps." };

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      checklist: items as unknown as Prisma.InputJsonValue,
      checklistTemplateId: template.id,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/** Drops the checklist from the ticket. The template itself is untouched. */
export async function removeChecklistAction(
  ticketId: string,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  await db.ticket.update({
    where: { id: ticket.id },
    data: { checklist: Prisma.DbNull, checklistTemplateId: null },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/**
 * Puts a removed checklist back exactly as it was — steps, ticks and stamps.
 *
 * This exists so `removeChecklistAction` can be a "Removed · Undo" toast
 * instead of a confirm dialog. `attachChecklistAction` is NOT that reverse:
 * it copies the template fresh, so every tick the bench had already earned
 * would come back unticked, and an Undo that silently unticks eleven steps is
 * a worse outcome than the deletion it claimed to fix.
 *
 * THREE THINGS IT REFUSES TO TRUST
 *
 *   · The rows. They made a round trip through a browser, so they go back
 *     through `parseChecklist` — the same gate the read path uses, which caps
 *     the count and the label length and coerces `done` to a boolean.
 *   · The template id. It is provenance, not substance: an id belonging to
 *     another shop must never be written, and one whose template has since
 *     been deleted must not fail the restore. Either way the steps go back
 *     and the pointer is simply dropped.
 *   · The ticket still being empty. Somebody may have attached a different
 *     checklist in the seconds the toast was up, and an undo that overwrites
 *     newer work is not an undo.
 */
export async function restoreChecklistAction(
  ticketId: string,
  items: ChecklistItem[],
  templateId: string | null,
): Promise<ActionState> {
  const { shopId } = await requireUser();

  const restored = parseChecklist(items);
  if (restored.length === 0) return { error: "There is no checklist to put back." };

  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  if (parseChecklist(ticket.checklist).length > 0) {
    return { error: "This ticket already has a checklist on it." };
  }

  let checklistTemplateId: string | null = null;
  if (templateId) {
    const template = await db.checklistTemplate.findFirst({
      where: { id: templateId, shopId },
      select: { id: true },
    });
    checklistTemplateId = template?.id ?? null;
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      checklist: restored as unknown as Prisma.InputJsonValue,
      checklistTemplateId,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}
