"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logInbound } from "@/lib/comms";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";

/**
 * The customer's side of the conversation on a repair.
 *
 * A reply lands as THREE facts, because staff need all three:
 *
 *   · a PUBLIC TicketComment with `authorId: null` — the timeline reads it as
 *     something the customer said, not something a colleague wrote;
 *   · a CommunicationLog row with `direction: "IN"`, so the outbox is a
 *     complete record of the conversation in both directions;
 *   · `Ticket.lastInboundAt`, which is what "this customer is waiting on us"
 *     is measured from.
 *
 * The ticket is filtered on customerId AND shopId from the cookie — the id in
 * the URL is only ever a filter, never a lookup key.
 */

export type PortalReplyResult = { ok: true } | { ok: false; error: string };

const bodyField = z
  .string()
  .trim()
  .min(2, "Write a message first.")
  .max(4000, "That message is too long — please shorten it.");

export async function replyToTicketAction(
  ticketId: string,
  formData: FormData,
): Promise<PortalReplyResult> {
  const session = await getPortalSession();
  if (!session) {
    return { ok: false, error: "Your sign-in link has expired. Please request a new one." };
  }

  const parsed = bodyField.safeParse(formData.get("body"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Write a message first." };
  }
  const body = parsed.data;

  const ticket = await db.ticket.findFirst({
    where: {
      id: ticketId,
      customerId: session.customerId,
      shopId: session.shopId,
    },
    select: { id: true, number: true },
  });
  if (!ticket) {
    return { ok: false, error: "That repair is no longer available here." };
  }

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.ticketComment.create({
      data: {
        shopId: session.shopId,
        ticketId: ticket.id,
        authorId: null,
        body,
        isPublic: true,
        subject: `Message from the customer`,
        channel: "NOTE",
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { lastInboundAt: now, updatedAt: now },
    });
  });

  // Outside the transaction: the outbox is a record, and a hiccup writing it
  // must not swallow a message the customer has already been told we received.
  await logInbound({
    shopId: session.shopId,
    customerId: session.customerId,
    ticketId: ticket.id,
    subject: `Reply on ticket #${ticket.number}`,
    body,
    status: "portal",
  });

  revalidatePath(`/portal/tickets/${ticket.id}`);
  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");

  return { ok: true };
}
