"use server";

/**
 * Attachment removal.
 *
 * Uploading lives in the route handler at ./[id]/upload/route.ts (see the note
 * there about body size limits); deleting is a plain Server Action because the
 * payload is one id.
 */

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/tickets/action-state";
import { removeUpload } from "@/lib/storage";

/**
 * Deletes an attachment: the row first, then the file.
 *
 * WHO CAN: the OWNER, or the person who uploaded it. A tech can clean up a
 * blurry photo they just took without being able to remove the intake photos
 * somebody else attached — that evidence is the shop's answer when a customer
 * says the dent was already there.
 *
 * Row-then-file is deliberate. If the unlink fails we are left with an orphaned
 * file nobody can reach, which is housekeeping. File-first would risk the
 * opposite — a surviving row pointing at nothing, which renders as a broken
 * thumbnail staff can't get rid of.
 */
export async function deleteAttachmentAction(
  attachmentId: string,
): Promise<ActionState> {
  const { shopId, userId, role } = await requireUser();

  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, shopId },
    select: {
      id: true,
      path: true,
      storage: true,
      ticketId: true,
      uploadedById: true,
    },
  });
  if (!attachment) return { error: "That file is already gone." };

  if (role !== "OWNER" && attachment.uploadedById !== userId) {
    return { error: "Only the owner or whoever uploaded it can delete this file." };
  }

  await db.attachment.delete({ where: { id: attachment.id } });
  // The row records which driver wrote it, so a file stored on disk
  // before the bucket was switched on is still deleted from disk.
  await removeUpload(attachment.storage, attachment.path);

  if (attachment.ticketId) revalidatePath(`/tickets/${attachment.ticketId}`);
  return { ok: true };
}
