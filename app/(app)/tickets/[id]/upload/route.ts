/**
 * POST /tickets/<id>/upload — multipart file upload for a ticket.
 *
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION
 * -------------------------------------------
 * Server Actions cap the request body at 1MB by default
 * (`serverActions.bodySizeLimit`), and this feature promises 10MB per file.
 * Raising that cap means editing next.config.ts — a shared, app-wide setting —
 * to loosen a DDoS guard for every action in the app, just so one card can take
 * a photo. A route handler has no such cap, so the limit stays exactly where it
 * belongs: on this endpoint, enforced per file, in one place.
 *
 * Everything else about it is a Server Action: same session, same tenancy
 * check, same shape of friendly error.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { storeUpload } from "../../attachment-storage";

/** Enough for a folder of photos, few enough that one request can't be a flood. */
const MAX_FILES_PER_REQUEST = 20;

export type UploadResponse =
  | { ok: true; uploaded: number; errors: string[] }
  | { ok: false; error: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // getSession, not requireUser: `requireUser` redirects, and a redirect is a
  // confusing answer to give a fetch() that expected JSON.
  const session = await getSession();
  if (!session) {
    return NextResponse.json<UploadResponse>(
      { ok: false, error: "Your session expired — reload the page and sign in." },
      { status: 401 },
    );
  }

  const { id } = await params;

  // The ticket must belong to THIS shop before a single byte is written.
  // Scoped findFirst per the tenancy contract in lib/db.ts.
  const ticket = await db.ticket.findFirst({
    where: { id, shopId: session.shopId },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json<UploadResponse>(
      { ok: false, error: "Ticket not found." },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json<UploadResponse>(
      { ok: false, error: "That upload didn't arrive in one piece — try again." },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json<UploadResponse>(
      { ok: false, error: "No files were sent." },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json<UploadResponse>(
      {
        ok: false,
        error: `That's ${files.length} files at once — ${MAX_FILES_PER_REQUEST} is the maximum per upload.`,
      },
      { status: 400 },
    );
  }

  // Partial success is the right outcome for a batch: five photos where one is
  // a 40MB video should store four and name the one that didn't make it.
  const errors: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    const stored = await storeUpload(session.shopId, file);
    if (!stored.ok) {
      errors.push(stored.reason);
      continue;
    }

    // The row is written only after the bytes are safely on disk, so a failed
    // write can never leave an attachment that renders as a broken image.
    await db.attachment.create({
      data: {
        shopId: session.shopId,
        ticketId: ticket.id,
        uploadedById: session.userId,
        fileName: stored.upload.fileName,
        mimeType: stored.upload.mimeType,
        sizeBytes: stored.upload.sizeBytes,
        path: stored.upload.path,
      },
    });
    uploaded += 1;
  }

  revalidatePath(`/tickets/${ticket.id}`);

  return NextResponse.json<UploadResponse>({ ok: true, uploaded, errors });
}
