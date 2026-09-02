"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Time-entry billing flags.
 *
 * Separate from the big tickets/actions.ts on purpose: this is the only thing
 * on the timer card that mutates something other than the clock, and keeping it
 * here leaves the timer actions themselves untouched.
 *
 * The tenant rule is the same as everywhere else — the entry is re-read with
 * `{ id, shopId }` before anything is written, so an id from another shop
 * matches nothing rather than flipping someone else's row.
 */

export type TimeResult = { ok: true } | { ok: false; error: string };

/**
 * Marks an entry billable or not.
 *
 * An entry that has already been billed is frozen: its money is sitting on an
 * invoice the customer may have paid, and quietly un-billing it would leave the
 * ticket claiming work that the books say was charged for.
 */
export async function setTimeEntryBillableAction(
  entryId: string,
  billable: boolean,
): Promise<TimeResult> {
  const { shopId } = await requireUser();

  if (typeof entryId !== "string" || !entryId) {
    return { ok: false, error: "That time entry no longer exists." };
  }

  const entry = await db.timeEntry.findFirst({
    where: { id: entryId, shopId },
    select: { id: true, ticketId: true, invoiceId: true },
  });
  if (!entry) return { ok: false, error: "That time entry no longer exists." };

  if (entry.invoiceId) {
    return {
      ok: false,
      error: "This time has already been billed — void the invoice to release it.",
    };
  }

  await db.timeEntry.update({
    where: { id: entry.id },
    data: { billable },
  });

  revalidatePath(`/tickets/${entry.ticketId}`);
  return { ok: true };
}
