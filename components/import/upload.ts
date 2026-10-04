import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { readSpreadsheet } from "@/lib/spreadsheet-import";
import { saveImportBatch } from "@/lib/import-store";
import { autoMap, fieldsFor, SAMPLE_CSV, type ImportKind } from "./fields";
import type { UploadResult } from "./import-wizard";

/**
 * The body of both import upload endpoints.
 *
 * A route handler rather than a server action, because actions cap request
 * bodies at 1MB (`serverActions.bodySizeLimit`) and this feature promises 5MB.
 * Raising that cap would loosen a DDoS guard for every action in the app to
 * suit one screen — the same reasoning as the ticket photo upload.
 *
 * The parsed table is stored server-side and only its id comes back, so the
 * rows the committer will trust are never handed to the browser and posted
 * again.
 *
 * Reading a workbook is the most expensive thing a signed-in user can ask of
 * this server without a database, so it is rate limited per person and the
 * parser itself is bounded (see readSpreadsheet).
 */

const MAX_BYTES = 5 * 1024 * 1024;
/**
 * Uploads per person per minute. The wizard posts the file again to switch
 * sheet or header row, so a real session makes a handful — this only stops a
 * loop.
 */
const UPLOADS_PER_MINUTE = 12;

export async function handleImportUpload(
  request: Request,
  kind: ImportKind,
  /** Roles allowed to import this kind of record. */
  allowed: readonly string[],
): Promise<Response> {
  // getSession, not requireUser: `requireUser` redirects, and a 307 to /login is
  // a confusing answer to give a fetch() that expected JSON.
  const session = await getSession();
  if (!session) {
    return json({
      ok: false,
      error: "Your session expired — reload the page and sign in.",
    }, 401);
  }
  if (!allowed.includes(session.role)) {
    return json({ ok: false, error: "You don't have access to this import." }, 403);
  }

  // Before the body is read, so a refused upload costs almost nothing.
  const throttle = rateLimit(`import-upload:${session.shopId}:${session.userId}`, UPLOADS_PER_MINUTE, 60_000);
  if (!throttle.allowed) {
    return json({
      ok: false,
      error: `That's a lot of uploads in a row — try again ${retryAfterLabel(throttle.retryAfterMs)}.`,
    }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "That upload didn't arrive in one piece — try again." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "No file was sent." }, 400);
  }
  if (file.size === 0) {
    return json({ ok: false, error: "That file is empty." }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({
      ok: false,
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — 5 MB is the limit.`,
    }, 400);
  }

  let table;
  try {
    table = readSpreadsheet(new Uint8Array(await file.arrayBuffer()), file.name, kind, {
      sheetName: String(form.get("sheetName") ?? "") || undefined,
      headerRow: form.get("headerRow") ? Number(form.get("headerRow")) : undefined,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unable to read this spreadsheet. Try exporting it as Excel or CSV." }, 400);
  }
  if (table.headers.length === 0) {
    return json({ ok: false, error: "That file has no header row." }, 400);
  }
  if (table.rows.length === 0) {
    return json({ ok: false, error: "That file has a header but no rows." }, 400);
  }

  const batchId = await saveImportBatch({
    shopId: session.shopId,
    kind,
    fileName: file.name,
    headers: table.headers,
    rows: table.rows,
    headerRow: table.headerRow,
  });

  return json({
    ok: true,
    batchId,
    fileName: file.name,
    headers: table.headers,
    rowCount: table.rows.length,
    mapping: autoMap(table.headers, fieldsFor(kind)),
    sheets: table.sheets,
    sheetName: table.sheetName,
    headerRow: table.headerRow,
    sample: table.rows.slice(0, 3),
  });
}

function json(body: UploadResult, status = 200): Response {
  return NextResponse.json(body, { status });
}

/** The downloadable example, served as a real file rather than a preview. */
export function sampleCsvResponse(kind: ImportKind): Response {
  return new Response(SAMPLE_CSV[kind], {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="repairpilot-${kind}-sample.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
