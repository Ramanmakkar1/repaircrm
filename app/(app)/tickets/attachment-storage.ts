/**
 * Where uploaded files actually live.
 *
 * LAYOUT
 *   public/uploads/<shopId>/<32 hex chars>.<ext>
 *   served as        /uploads/<shopId>/<32 hex chars>.<ext>
 *
 * TWO RULES, BOTH LOAD-BEARING
 *
 * 1. The tenant is in the PATH. `shopId` comes from the session and never from
 *    the request body, so one shop's files can't be written into another's
 *    folder, and a stray `rm -rf` of one tenant is a single directory.
 *
 * 2. The name on disk is RANDOM, never the name the customer's file arrived
 *    with. The original lives in `Attachment.fileName` and is only ever
 *    rendered as text. That kills path traversal (`../../.env`), collisions
 *    between two "IMG_0001.jpg", and the guessability that would otherwise make
 *    /uploads enumerable — the URLs are unguessable even though the directory
 *    is public.
 *
 * KNOWN LIMIT: this writes to the app's own `public/` directory, which means
 * the files are on the machine that served the request. That is right for a
 * single-box deploy and wrong for a serverless or multi-instance one, where
 * this module is the single place to swap for object storage — everything
 * above it only ever sees the `/uploads/...` string.
 */

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MAX_UPLOAD_BYTES,
  resolveMimeType,
  safeExtension,
} from "@/components/tickets/attachment-meta";

/** Absolute path to public/uploads, created on demand. */
function uploadsRoot(): string {
  return path.join(process.cwd(), "public", "uploads");
}

export type StoredUpload = {
  /** Public, /uploads-relative — this is what goes in `Attachment.path`. */
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Validates and writes one file. Returns the row data to persist, or a sentence
 * explaining the refusal — never throws for a bad upload, because a batch of
 * five files where one is a 40MB video should still store the other four.
 */
export async function storeUpload(
  shopId: string,
  file: File,
): Promise<{ ok: true; upload: StoredUpload } | { ok: false; reason: string }> {
  // The browser already checked all three of these. It is not the browser's
  // job to be right about them.
  const fileName = sanitizeDisplayName(file.name);

  if (file.size === 0) {
    return { ok: false, reason: `${fileName} is empty.` };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `${fileName} is larger than the 10 MB limit.` };
  }

  const mimeType = resolveMimeType(file.type, fileName);
  if (!mimeType) {
    return {
      ok: false,
      reason: `${fileName} isn't a supported file type. Images, PDFs, text or log files and zips only.`,
    };
  }

  const diskName = `${randomBytes(16).toString("hex")}.${safeExtension(fileName, mimeType)}`;
  const directory = path.join(uploadsRoot(), shopId);

  // recursive: true also makes this a no-op when the directory already exists,
  // so there is no check-then-create race between two concurrent uploads.
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, diskName), Buffer.from(await file.arrayBuffer()));

  return {
    ok: true,
    upload: {
      path: `/uploads/${shopId}/${diskName}`,
      fileName,
      mimeType,
      sizeBytes: file.size,
    },
  };
}

/**
 * Deletes the file behind an attachment row. Best-effort by design: the row is
 * the record staff see, so a missing or already-deleted file must not block
 * removing it. An orphaned byte on disk is a housekeeping problem; a row that
 * refuses to delete is a support ticket.
 *
 * The path is re-derived from `shopId` + basename rather than trusted, so even
 * a hand-edited `Attachment.path` cannot aim `unlink` outside this shop's
 * upload directory.
 */
export async function removeUpload(
  shopId: string,
  publicPath: string,
): Promise<void> {
  const expectedPrefix = `/uploads/${shopId}/`;
  if (!publicPath.startsWith(expectedPrefix)) return;

  const base = path.basename(publicPath);
  if (!/^[a-f0-9]{32}\.[a-z0-9]{1,8}$/.test(base)) return;

  try {
    await unlink(path.join(uploadsRoot(), shopId, base));
  } catch {
    // ENOENT and friends: the row is what matters, and it is going anyway.
  }
}

/**
 * The original filename, kept for display only.
 *
 * Stripped of directory parts and control characters — not for filesystem
 * safety (it never touches the filesystem) but because a name like
 * `../../etc/passwd` rendered in a list is a confusing lie about where the file
 * is, and a name carrying a newline breaks the layout.
 */
function sanitizeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // Control characters are dropped by code point rather than by a regex range,
  // so the guard survives a copy/paste through anything that eats escapes.
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned.slice(0, 180) || "upload";
}
