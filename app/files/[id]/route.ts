import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";
import { readUpload } from "@/lib/storage";

/**
 * GET /files/<attachmentId> — the ONE way an attachment is read.
 *
 * WHY THIS EXISTS
 * ---------------
 * Uploads used to be linked as `/uploads/<shopId>/<random>.<ext>`, served
 * straight off the public directory. That made the random filename the only
 * thing standing between a customer's intake photos and anyone who guessed a
 * URL — and it stopped working entirely the moment the bytes moved to a bucket.
 *
 * Now every link is `/files/<id>` and this handler answers it:
 *
 *   1. Resolve the attachment row by id.
 *   2. Authorise: a STAFF session in the same shop, or a PORTAL session
 *      belonging to the customer the file is attached to.
 *   3. Stream the bytes back through whichever storage driver wrote them.
 *
 * The two session kinds are checked independently and neither can stand in for
 * the other (see lib/portal-session.ts) — a customer holding a portal cookie
 * gets exactly their own files and nothing else in the shop. (The portal cookie
 * is path-scoped to `/portal`, so today only staff requests actually arrive
 * here with credentials; the portal branch is what makes the ownership rule a
 * property of this handler rather than of which page rendered the link.)
 *
 * NOT FOUND vs FORBIDDEN: an attachment belonging to another shop, or to
 * another customer, answers 404. A 403 would confirm the id is real.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Private, and never by a shared cache. `no-store` is deliberate. */
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      shopId: true,
      customerId: true,
      ticketId: true,
      fileName: true,
      mimeType: true,
      path: true,
      storage: true,
      ticket: { select: { customerId: true } },
    },
  });

  if (!attachment) return notFound();

  if (!(await allowed(attachment))) return notFound();

  const object = await readUpload(attachment.storage, attachment.path);
  if (!object) return notFound();

  return new NextResponse(new Uint8Array(object.body), {
    status: 200,
    headers: {
      ...HEADERS,
      // The type from the ROW, not from the storage provider: the row's type
      // was whitelisted at upload time (see attachment-meta.ts), which is what
      // keeps a stored `text/html` from ever being served as one.
      "Content-Type": attachment.mimeType,
      "Content-Length": String(object.sizeBytes),
      // `inline` so a photo opens in the tab it was clicked from; the filename
      // is quoted and stripped of quotes so it cannot break out of the header.
      "Content-Disposition": `inline; filename="${headerSafe(attachment.fileName)}"`,
    },
  });
}

type Row = {
  shopId: string;
  customerId: string | null;
  ticket: { customerId: string } | null;
};

/**
 * Staff first (the common case, one cookie read), portal second.
 *
 * A file's owning customer is either the row's own `customerId` or the customer
 * on the ticket it hangs off — a ticket attachment has no `customerId` of its
 * own, and the portal customer must still be able to see the photos of their
 * own repair.
 */
async function allowed(row: Row): Promise<boolean> {
  const staff = await getSession();
  if (staff) return staff.shopId === row.shopId;

  const portal = await getPortalSession();
  if (!portal) return false;
  if (portal.shopId !== row.shopId) return false;

  const owner = row.customerId ?? row.ticket?.customerId ?? null;
  return owner !== null && owner === portal.customerId;
}

function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404, headers: HEADERS });
}

/** Quotes and backslashes cannot appear in a quoted header value. */
function headerSafe(fileName: string): string {
  return fileName.replace(/["\\]/g, "_").replace(/[\r\n]/g, "");
}
