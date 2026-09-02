"use server";

import { revalidatePath } from "next/cache";

import { commitImport, previewImport } from "@/components/import/commit";
import type { DuplicateMode } from "@/components/import/commit";
import type { Mapping } from "@/components/import/fields";
import type { CommitResult, PreviewResult } from "@/components/import/import-wizard";
import { requireUser } from "@/lib/auth";
import { deleteImportBatch, readImportBatch } from "@/lib/import-store";

/**
 * Steps 2–4 of the customer importer.
 *
 * The only thing crossing the wire is a batch id: the rows themselves were
 * parsed once at upload and have stayed on the server since, so nothing the
 * committer trusts can be edited in between. The batch is re-read against the
 * session's `shopId`, which means a guessed id from another tenant reads
 * nothing at all.
 */

const ALLOWED = ["OWNER", "FRONT_DESK"];
const DENIED = "You don't have access to the customer importer.";
const GONE =
  "That upload has expired — imports are held for an hour. Upload the file again.";

export async function previewCustomerImportAction(
  batchId: string,
  mapping: Mapping,
): Promise<PreviewResult> {
  const { shopId, role } = await requireUser();
  if (!ALLOWED.includes(role)) return { ok: false, error: DENIED };

  const batch = await readImportBatch(shopId, batchId);
  if (!batch || batch.kind !== "customers") return { ok: false, error: GONE };

  return { ok: true, preview: await previewImport(shopId, batch, mapping) };
}

export async function commitCustomerImportAction(
  batchId: string,
  mapping: Mapping,
  mode: DuplicateMode,
): Promise<CommitResult> {
  const { shopId, role } = await requireUser();
  if (!ALLOWED.includes(role)) return { ok: false, error: DENIED };

  const batch = await readImportBatch(shopId, batchId);
  if (!batch || batch.kind !== "customers") return { ok: false, error: GONE };

  const summary = await commitImport(shopId, batch, mapping, mode);

  // The scratch file has done its job; leaving it around would be a copy of the
  // shop's customer list sitting in the OS temp directory.
  await deleteImportBatch(batchId);

  revalidatePath("/customers");
  return { ok: true, summary };
}
