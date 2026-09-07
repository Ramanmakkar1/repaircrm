"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActionState } from "@/components/tickets/action-state";
import {
  PRIORITIES,
  parseDateInput,
  problemTypes,
  type PriorityKey,
} from "@/components/tickets/ticket-meta";

/**
 * One field of one ticket, written on its own.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `updateTicketAction`
 * ---------------------------------------------------------------------------
 * The edit form rewrites the whole record: subject, problem type, priority,
 * assignee, device, due date, warranty claim and diagnostic notes, all in one
 * `update`. Two people editing different fields of the same ticket therefore
 * overwrite each other — whoever submits second wins on every column, not just
 * the one they touched. Writing one named column is what makes the concurrent
 * case correct, and it is the reason this action exists rather than the header
 * simply reusing the form's.
 *
 * ---------------------------------------------------------------------------
 * THE ALLOW-LIST IS THE POINT
 * ---------------------------------------------------------------------------
 * `field` arrives over the wire and is NEVER spread into a Prisma `data`
 * object. Every branch below names its own column as a literal, so this
 * endpoint — whose entire job is "set this field to that value" — cannot be
 * talked into setting `shopId`, `id`, `depositCents`, or anything else that is
 * not one of the four columns a header cell is allowed to move. An unknown
 * name is refused before a single query runs.
 *
 * MULTI-TENANCY: `shopId` comes from the session, never the client. The write
 * is a `updateMany` filtered on `{ id, shopId }`, so a guessed ticket id from
 * another tenant matches zero rows and comes back as "not found" — the same
 * shape of answer a deleted ticket gives, which is what keeps it from being an
 * existence oracle. The assignee is re-checked against the same shop.
 *
 * REFUSALS COME BACK AS DATA, NOT AS A THROW. React replaces a thrown error's
 * message with an opaque digest when it crosses a Server Action boundary in a
 * production build, so a `throw new Error("That is not a priority.")` here
 * would reach the operator as "An error occurred in the Server Components
 * render". The message is the whole point of the refusal, so it is returned;
 * `components/tickets/ticket-fields.tsx` turns it back into the Error that
 * `InlineEdit` catches and prints under the field.
 *
 * No audit row: neither `updateTicketAction` nor `setTicketLocationAction`
 * writes one, `AuditAction` has no `ticket.updated` member, and a trail that
 * records the header's edits but not the form's would be worse than none.
 */
export async function setTicketFieldAction(
  ticketId: string,
  field: string,
  value: string,
): Promise<ActionState> {
  // The same guard the full edit form uses: any signed-in member of the shop
  // may edit a ticket. Deleting one is the OWNER-only act, not changing a due
  // date, so `requireUser` is the matching check and not a weaker one.
  const { shopId } = await requireUser();

  const next = value.trim();

  /*
   * A union, not `Record<string, unknown>`. The type is what stops a later
   * edit from widening this into "whatever the caller named": every member
   * spells one column, so adding a fifth field means adding a branch AND a
   * member, in view of this comment.
   */
  let data:
    | { dueDate: Date | null }
    | { assignedToId: string | null }
    | { priority: PriorityKey }
    | { problemType: string };

  switch (field) {
    case "dueDate": {
      // Clearing the date is a legitimate edit — an empty input means "no
      // promised date", not "nothing to do".
      if (next === "") {
        data = { dueDate: null };
        break;
      }
      const due = parseDateInput(next);
      if (!due) return { error: "That is not a date. Use YYYY-MM-DD." };
      data = { dueDate: due };
      break;
    }

    case "assignedToId": {
      if (next === "") {
        data = { assignedToId: null };
        break;
      }
      // Scoped read: a user id from another tenant simply does not exist here,
      // so a forged one cannot staple another shop's technician to this job.
      const tech = await db.user.findFirst({
        where: { id: next, shopId },
        select: { id: true },
      });
      if (!tech) return { error: "That person is not on this shop's team." };
      data = { assignedToId: tech.id };
      break;
    }

    case "priority": {
      // Membership, not `asPriority` — the coercing reader answers NORMAL for
      // anything it does not recognise, which is right for a form default and
      // wrong here, where silently demoting an URGENT job is the failure.
      if (!(PRIORITIES as readonly string[]).includes(next)) {
        return { error: "That is not a priority." };
      }
      data = { priority: next as PriorityKey };
      break;
    }

    case "problemType": {
      // `problemType` is a free-form column, so the closed list has to be
      // fetched: it is whatever this shop configured, falling back to the
      // shipped defaults.
      const shop = await db.shop.findUnique({
        where: { id: shopId },
        select: { settings: true },
      });
      if (!problemTypes(shop?.settings).includes(next)) {
        return { error: "That is not one of this shop's problem types." };
      }
      data = { problemType: next };
      break;
    }

    default:
      return { error: "That field can't be edited from here." };
  }

  // updateMany doubles as the ownership check: a foreign id matches 0 rows.
  const { count } = await db.ticket.updateMany({
    where: { id: ticketId, shopId },
    data,
  });
  if (count === 0) return { error: "Ticket not found." };

  // The record first, so the optimistic value in the header has something to
  // reconcile against; the list too, because due date, assignee and priority
  // are all columns somebody is filtering or sorting on over there.
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { ok: true };
}
