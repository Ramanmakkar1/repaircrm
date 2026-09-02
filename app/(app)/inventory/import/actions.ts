"use server";

import { revalidatePath } from "next/cache";

import { commitImport, previewImport } from "@/components/import/commit";
import type { DuplicateMode } from "@/components/import/commit";
import type { Mapping } from "@/components/import/fields";
import type { CommitResult, PreviewResult } from "@/components/import/import-wizard";
import { requireUser } from "@/lib/auth";
import { deleteImportBatch, readImportBatch } from "@/lib/import-store";

/**
 * Steps 2–4 of the product importer.
 *
 * Owner only, because a product row carries `cost` — the number the rest of the
 * app already hides from other roles. Everything else mirrors the customer
 * importer: only a batch id travels, and it is re-read scoped to the session's
 * shop.
 */

const GONE =
  "That upload has expired — imports are held for an hour. Upload the file again.";
const DENIED = "Only an owner can import products.";

export async function previewProductImportAction(
  batchId: string,
  mapping: Mapping,
): Promise<PreviewResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { ok: false, error: DENIED };

  const batch = await readImportBatch(shopId, batchId);
  if (!batch || batch.kind !== "products") return { ok: false, error: GONE };

  return { ok: true, preview: await previewImport(shopId, batch, mapping) };
}

export async function commitProductImportAction(
  batchId: string,
  mapping: Mapping,
  mode: DuplicateMode,
): Promise<CommitResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { ok: false, error: DENIED };

  const batch = await readImportBatch(shopId, batchId);
  if (!batch || batch.kind !== "products") return { ok: false, error: GONE };

  const summary = await commitImport(shopId, batch, mapping, mode);
  await deleteImportBatch(batchId);

  revalidatePath("/inventory");
  return { ok: true, summary };
}
