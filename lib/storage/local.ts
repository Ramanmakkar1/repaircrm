import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PutInput, StorageDriver, StoredObject } from "./types";

/**
 * Files on the app's own disk, under `public/uploads/<shopId>/<random>.<ext>`.
 *
 * THE DEFAULT DRIVER, and the one every existing row was written by. Its stored
 * path is the historical public one (`/uploads/…`) so nothing has to be
 * migrated when object storage is switched on later: old rows keep
 * `storage: "local"` and keep resolving through here.
 *
 * The bytes still land under `public/`, but they are no longer *served* from
 * there — /files/[id] reads them through this driver after checking the
 * session, so an unguessable URL is not the only thing protecting a customer's
 * intake photos.
 *
 * KNOWN LIMIT, unchanged: the file is on the machine that served the request.
 * Right for a single box, wrong for several — which is what the s3 driver is
 * for.
 */

function uploadsRoot(): string {
  return path.join(process.cwd(), "public", "uploads");
}

/**
 * Resolves a stored path to a real file, refusing anything that is not shaped
 * exactly like something this driver wrote.
 *
 * `Attachment.path` is a database column, and a column can be edited. Rebuilding
 * the path from a validated shopId and a validated basename — rather than
 * joining the stored string onto a root — is what stops `/uploads/../../.env`
 * from ever becoming a readable file.
 */
function resolveLocal(storedPath: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9_-]{1,64})\/([a-f0-9]{32}\.[a-z0-9]{1,8})$/.exec(
    storedPath,
  );
  if (!match) return null;
  return path.join(uploadsRoot(), match[1], match[2]);
}

export const localDriver: StorageDriver = {
  name: "local",

  async put({ key, body }: PutInput): Promise<string> {
    const directory = path.join(uploadsRoot(), path.dirname(key));
    // recursive: true is also a no-op when the directory exists, so two
    // concurrent uploads cannot race a check-then-create.
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(uploadsRoot(), key), body);
    return `/uploads/${key}`;
  },

  async get(storedPath: string): Promise<StoredObject | null> {
    const absolute = resolveLocal(storedPath);
    if (!absolute) return null;

    try {
      const body = await readFile(absolute);
      // The mime type lives on the Attachment row, which is the caller's; the
      // driver reports only what it can actually know.
      return { body, contentType: null, sizeBytes: body.byteLength };
    } catch {
      return null;
    }
  },

  async remove(storedPath: string): Promise<void> {
    const absolute = resolveLocal(storedPath);
    if (!absolute) return;
    try {
      await unlink(absolute);
    } catch {
      // ENOENT and friends: the row is what matters, and it is going anyway.
    }
  },
};
