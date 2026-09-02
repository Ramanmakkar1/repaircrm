/**
 * POST /portal/tickets/<id>/upload — the customer's own photo upload.
 *
 * Deliberately a twin of app/(app)/tickets/[id]/upload/route.ts: same route
 * handler shape (Server Actions cap a body at 1MB; a phone photo is not),
 * the same `storeUpload` on the other side, and the same MIME/size rules from
 * components/tickets/attachment-meta — one whitelist, so a customer cannot post
 * something a member of staff could not.
 *
 * The ONE difference is the guard. There is no staff session here: the ticket
 * must belong to the portal cookie's `{ customerId, shopId }` pair before a
 * single byte is written, and the row is stamped with `customerId` and no
 * `uploadedById`, because nobody on staff uploaded it.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";
import { storeUpload } from "@/app/(app)/tickets/attachment-storage";

/** Lower than the staff limit: this is "a few photos of the crack", not a folder. */
const MAX_FILES_PER_REQUEST = 8;

export type PortalUploadResponse =
  | { ok: true; uploaded: number; errors: string[] }
  | { ok: false; error: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json<PortalUploadResponse>(
      { ok: false, error: "Your sign-in link has expired — please request a new one." },
      { status: 401 },
    );
  }

  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: { id, customerId: session.customerId, shopId: session.shopId },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json<PortalUploadResponse>(
      { ok: false, error: "That repair is no longer available here." },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json<PortalUploadResponse>(
      { ok: false, error: "That upload didn't arrive in one piece — try again." },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json<PortalUploadResponse>(
      { ok: false, error: "No files were sent." },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json<PortalUploadResponse>(
      {
        ok: false,
        error: `That's ${files.length} files at once — ${MAX_FILES_PER_REQUEST} is the maximum per upload.`,
      },
      { status: 400 },
    );
  }

  // Partial success, same as the staff route: three photos where one is a 40MB
  // video should store two and name the one that didn't make it.
  const errors: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    const stored = await storeUpload(session.shopId, file);
    if (!stored.ok) {
      errors.push(stored.reason);
      continue;
    }

    await db.attachment.create({
      data: {
        shopId: session.shopId,
        ticketId: ticket.id,
        customerId: session.customerId,
        // No uploadedById: this file came from the customer, not from staff.
        uploadedById: null,
        fileName: stored.upload.fileName,
        mimeType: stored.upload.mimeType,
        sizeBytes: stored.upload.sizeBytes,
        path: stored.upload.path,
      },
    });
    uploaded += 1;
  }

  revalidatePath(`/portal/tickets/${ticket.id}`);
  revalidatePath(`/tickets/${ticket.id}`);

  return NextResponse.json<PortalUploadResponse>({ ok: true, uploaded, errors });
}
