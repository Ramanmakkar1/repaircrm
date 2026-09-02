"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { validLocationId } from "@/lib/location";
import type { ActionState } from "@/components/tickets/action-state";

/**
 * Moves one ticket to another branch.
 *
 * Both ids are re-validated against the session's shop: the ticket with a
 * scoped `updateMany` (a foreign id matches zero rows), and the location with
 * `validLocationId`, which only ever answers with one of this shop's own
 * active branches.
 */
export async function setTicketLocationAction(
  ticketId: string,
  locationId: string,
): Promise<ActionState> {
  const { shopId } = await requireUser();

  const target = await validLocationId(shopId, locationId);
  if (!target) return { error: "That location is not available." };

  const { count } = await db.ticket.updateMany({
    where: { id: ticketId, shopId },
    data: { locationId: target },
  });
  if (count === 0) return { error: "Ticket not found." };

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  return { ok: true };
}
