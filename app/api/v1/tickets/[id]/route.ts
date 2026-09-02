import { z } from "zod";

import { db } from "@/lib/db";
import { emitTicketEvent } from "@/lib/events";
import { isResolved } from "@/components/tickets/ticket-meta";
import { withApiKey } from "../../_lib/handler";
import { isoDate } from "../../_lib/schema";
import {
  apiError,
  apiItem,
  noFieldsError,
  readJson,
  zodError,
} from "../../_lib/respond";
import { serialiseTicketDetail, ticketDetailSelect } from "../../_lib/shapes";

/**
 * /api/v1/tickets/{id}
 *
 *   GET     the ticket, its customer, its device (without the unlock
 *           password), its charges, and PUBLIC COMMENTS ONLY — the
 *           `isPublic: true` filter lives in the select in _lib/shapes.ts, so
 *           an internal note is never even loaded here.
 *   PATCH   change status, priority, assignee, subject, due date
 *   DELETE  remove the ticket and everything hanging off it
 *
 * A ticket id from another shop answers 404, not 403.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: { id, shopId: auth.shopId },
    select: ticketDetailSelect,
  });

  if (!ticket) return apiError("not_found", "No ticket with that id.");

  return apiItem(serialiseTicketDetail(ticket));
});

const patchSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  problemType: z.string().trim().min(1).max(80).optional(),
  status: z.string().trim().min(1).max(60).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().trim().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});

/**
 * PATCH mirrors what the update composer does on screen, minus the note.
 *
 * A STATUS CHANGE IS NOT JUST A COLUMN WRITE. Entering the resolved state
 * stamps `resolvedAt`; leaving it clears the stamp, so a reopened ticket cannot
 * report a resolution date that has been overtaken. That rule lives in the UI
 * action too, and the two must not drift — a ticket resolved by an integration
 * has to look exactly like one resolved at the counter.
 */
export const PATCH = withApiKey<Params>(async (request, auth, { params }) => {
  const { id } = await params;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  if (Object.keys(input).length === 0) {
    return noFieldsError(Object.keys(patchSchema.shape));
  }

  const ticket = await db.ticket.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, status: true },
  });
  if (!ticket) return apiError("not_found", "No ticket with that id.");

  if (input.assignedToId) {
    const user = await db.user.findFirst({
      where: { id: input.assignedToId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!user) return apiError("not_found", "No team member with that id.");
  }

  const statusChanged =
    input.status !== undefined && input.status !== ticket.status;

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(input.problemType === undefined ? {} : { problemType: input.problemType }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.assignedToId === undefined
        ? {}
        : { assignedToId: input.assignedToId }),
      ...(input.dueDate === undefined
        ? {}
        : { dueDate: input.dueDate === null ? null : new Date(input.dueDate) }),
      ...(input.status === undefined
        ? {}
        : {
            status: input.status,
            resolvedAt: isResolved(input.status) ? new Date() : null,
          }),
    },
  });

  // Two events, deliberately: an integration watching for "anything moved"
  // subscribes to status_changed, one watching for "the job is done"
  // subscribes to resolved, and neither has to know the shop's status names.
  if (statusChanged) {
    await emitTicketEvent(auth.shopId, "ticket.status_changed", ticket.id);
    if (isResolved(input.status!)) {
      await emitTicketEvent(auth.shopId, "ticket.resolved", ticket.id);
    }
  }

  const updated = await db.ticket.findFirst({
    where: { id: ticket.id, shopId: auth.shopId },
    select: ticketDetailSelect,
  });
  if (!updated) return apiError("not_found", "No ticket with that id.");

  return apiItem(serialiseTicketDetail(updated));
});

/**
 * DELETE — the same act as the OWNER's Delete button, and just as destructive:
 * comments, charges, time entries and attachments cascade with the ticket.
 *
 * An API key is treated as an owner (see _lib/handler.ts), which is exactly why
 * keys are created and revoked by owners only.
 */
export const DELETE = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  // deleteMany doubles as the ownership check: a foreign id matches 0 rows.
  const { count } = await db.ticket.deleteMany({
    where: { id, shopId: auth.shopId },
  });
  if (count === 0) return apiError("not_found", "No ticket with that id.");

  return apiItem({ id, deleted: true });
});
