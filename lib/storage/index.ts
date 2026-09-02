import { randomBytes } from "node:crypto";

import {
  MAX_UPLOAD_BYTES,
  resolveMimeType,
  safeExtension,
} from "@/components/tickets/attachment-meta";
import { localDriver } from "./local";
import { s3Driver, s3Configured } from "./s3";
import type { StorageDriver, StorageDriverName, StoredObject } from "./types";

export type { StorageDriver, StorageDriverName, StoredObject };
export { s3Configured };

/**
 * Where uploaded files live.
 *
 * ONE DECISION, MADE BY ENVIRONMENT
 * ---------------------------------
 *   STORAGE_DRIVER = local | s3        (unset -> local)
 *
 * `local` writes under `public/uploads/<shopId>/…` — right for a single box.
 * `s3` writes to any S3-compatible bucket (AWS, R2, MinIO) — right for
 * anything with more than one instance, or a filesystem that does not survive
 * a redeploy. See ./s3.ts for its variables.
 *
 * TWO RULES THAT SURVIVED THE MOVE TO DRIVERS, both load-bearing:
 *
 * 1. THE TENANT IS IN THE KEY. `shopId` comes from the session and never from
 *    the request, so one shop's files cannot be written into another's prefix,
 *    and a whole tenant's objects are one prefix to sweep.
 *
 * 2. THE NAME IS RANDOM, never the name the file arrived with. The original
 *    lives in `Attachment.fileName` and is only ever rendered as text. That
 *    kills path traversal (`../../.env`), collisions between two "IMG_0001.jpg",
 *    and any hope of enumerating a bucket.
 *
 * MIXED STORAGE IS NORMAL. Each row records the driver that wrote it in
 * `Attachment.storage`, and reads dispatch on that column — so switching the
 * env from local to s3 does not strand a single existing file, and no migration
 * is needed. New uploads go to the new driver; old ones keep resolving through
 * the old one.
 */

export function storageDriverName(): StorageDriverName {
  return process.env.STORAGE_DRIVER?.trim().toLowerCase() === "s3" ? "s3" : "local";
}

/** The driver NEW uploads are written with. */
export function activeDriver(): StorageDriver {
  return storageDriverName() === "s3" ? s3Driver : localDriver;
}

/**
 * The driver that wrote an existing row.
 *
 * Anything unrecognised resolves to local, which is what every row written
 * before this column existed actually used.
 */
export function driverFor(storage: string): StorageDriver {
  return storage === "s3" ? s3Driver : localDriver;
}

export type StoredUpload = {
  /** Goes in `Attachment.path` — the driver's own idea of a location. */
  path: string;
  /** Goes in `Attachment.storage` — which driver can read that path back. */
  storage: StorageDriverName;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Validates and stores one file, returning the row data to persist — or a
 * sentence explaining the refusal.
 *
 * Never throws for a bad upload, because a batch of five files where one is a
 * 40MB video should still store the other four. A driver failure (bucket
 * unreachable, credentials missing) is also returned as a refusal rather than
 * raised: the caller is mid-batch and wants to report on each file.
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

  const key = `${shopId}/${randomBytes(16).toString("hex")}.${safeExtension(fileName, mimeType)}`;
  const driver = activeDriver();

  try {
    const path = await driver.put({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: mimeType,
    });

    return {
      ok: true,
      upload: { path, storage: driver.name, fileName, mimeType, sizeBytes: file.size },
    };
  } catch (error) {
    console.error("[storage] upload failed:", error);
    return {
      ok: false,
      reason: `${fileName} could not be stored — file storage is not reachable.`,
    };
  }
}

/** Reads an attachment's bytes back, or null when the object is gone. */
export async function readUpload(
  storage: string,
  path: string,
): Promise<StoredObject | null> {
  try {
    return await driverFor(storage).get(path);
  } catch (error) {
    console.error("[storage] read failed:", error);
    return null;
  }
}

/**
 * Deletes the object behind an attachment row. Best-effort by design: the row
 * is the record staff see, so a missing or already-deleted object must not
 * block removing it.
 */
export async function removeUpload(storage: string, path: string): Promise<void> {
  try {
    await driverFor(storage).remove(path);
  } catch (error) {
    console.error("[storage] delete failed:", error);
  }
}

/**
 * The original filename, kept for display only.
 *
 * Stripped of directory parts and control characters — not for filesystem
 * safety (it never touches a filesystem path) but because a name like
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
