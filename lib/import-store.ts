import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Where a half-finished CSV import lives between wizard steps.
 *
 * The upload arrives at a route handler (server actions cap bodies at 1MB), but
 * mapping, preview and commit are three more round trips after that. Re-posting
 * a 5MB file at every step would be absurd, and keeping 5,000 parsed rows in a
 * cookie or in React state and re-sending them at commit would put the data the
 * server is about to trust back into the client's hands.
 *
 * So the parsed table is written once to a scratch file under the OS temp dir,
 * keyed by a random id, and every later step is handed only that id. The stored
 * envelope carries the `shopId` that uploaded it and every read checks it, so a
 * guessed id from another tenant reads nothing.
 *
 * Scratch, not storage: a batch is deleted the moment it commits, and anything
 * older than an hour is swept on the next upload. Losing one to a restart just
 * means re-uploading the file.
 */

const DIR = path.join(tmpdir(), "repairflow-imports");
const TTL_MS = 60 * 60 * 1000;

export type ImportKind = "customers" | "products";

export type ImportBatch = {
  id: string;
  shopId: string;
  kind: ImportKind;
  fileName: string;
  createdAt: number;
  headers: string[];
  rows: string[][];
};

function fileFor(id: string): string {
  // The id is minted here and never echoed back into a path without this guard,
  // so a "../../etc/passwd" id can't escape the scratch directory.
  if (!/^[a-f0-9]{32}$/.test(id)) return path.join(DIR, "invalid");
  return path.join(DIR, `${id}.json`);
}

/** Writes the parsed table and returns the id the wizard carries forward. */
export async function saveImportBatch(input: {
  shopId: string;
  kind: ImportKind;
  fileName: string;
  headers: string[];
  rows: string[][];
}): Promise<string> {
  await mkdir(DIR, { recursive: true });
  void sweepImportBatches();

  const id = randomBytes(16).toString("hex");
  const batch: ImportBatch = { id, createdAt: Date.now(), ...input };
  await writeFile(fileFor(id), JSON.stringify(batch), "utf8");
  return id;
}

/** Reads a batch back, or null when it is missing, expired or another shop's. */
export async function readImportBatch(
  shopId: string,
  id: string,
): Promise<ImportBatch | null> {
  let raw: string;
  try {
    raw = await readFile(fileFor(id), "utf8");
  } catch {
    return null;
  }

  let batch: ImportBatch;
  try {
    batch = JSON.parse(raw) as ImportBatch;
  } catch {
    return null;
  }

  if (batch.shopId !== shopId) return null;
  if (Date.now() - batch.createdAt > TTL_MS) {
    await deleteImportBatch(id);
    return null;
  }
  return batch;
}

export async function deleteImportBatch(id: string): Promise<void> {
  try {
    await unlink(fileFor(id));
  } catch {
    // Already gone — which is the state we wanted anyway.
  }
}

/** Drops every batch older than the TTL. Failures are ignored on purpose. */
async function sweepImportBatches(): Promise<void> {
  try {
    const names = await readdir(DIR);
    const cutoff = Date.now() - TTL_MS;
    await Promise.all(
      names.map(async (name) => {
        const full = path.join(DIR, name);
        const info = await stat(full).catch(() => null);
        if (info && info.mtimeMs < cutoff) await unlink(full).catch(() => {});
      }),
    );
  } catch {
    // The directory may not exist yet on the very first upload.
  }
}
