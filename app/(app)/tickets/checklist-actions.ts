"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checklistFromTemplate, parseChecklist } from "@/lib/checklist";
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
