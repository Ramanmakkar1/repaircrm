"use server";

import { revalidatePath } from "next/cache";

import { commitImport, previewImport } from "@/components/import/commit";
import type { DuplicateMode } from "@/components/import/commit";
import type { Mapping } from "@/components/import/fields";
import type { CommitResult, PreviewResult } from "@/components/import/import-wizard";
import { requireUser } from "@/lib/auth";
import { deleteImportBatch, readImportBatch } from "@/lib/import-store";
import { generate } from "@/lib/ai";
import { aiEnabled } from "@/lib/ai/config";
import { consumeAiQuota } from "@/lib/ai/quota";
import { importMappingPrompt, IMPORT_MAPPING_SYSTEM, parseMappingSuggestion, mappingResponseSchema } from "@/lib/ai/import-mapping";
import { rateLimit } from "@/lib/rate-limit";

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
const NO_AI = "AI matching isn't switched on for this shop. Match the columns by hand.";

export async function suggestProductMappingAction(batchId: string) {
  const { shopId, role, userId } = await requireUser();
  if (role !== "OWNER") return { ok: false as const, error: DENIED };
  const batch = await readImportBatch(shopId, batchId);
  if (!batch || batch.kind !== "products") return { ok: false as const, error: GONE };
  // Checked before the allowance is spent: the page hides the button when AI is
  // off, so this is only reached by a stale tab or a hand-made request.
  if (!aiEnabled()) return { ok: false as const, error: NO_AI };
  if (!rateLimit(`import-ai:${shopId}:${userId}`, 6, 60_000).allowed) return { ok: false as const, error: "Give the sheet assistant a moment, then try again." };
  const quota = await consumeAiQuota(shopId, "text");
  if (!quota.ok) return { ok: false as const, error: quota.reason };
  const result = await generate({ system: IMPORT_MAPPING_SYSTEM, prompt: importMappingPrompt(batch), maxTokens: 1200, purpose: "command", jsonSchema: mappingResponseSchema(batch.headers.length) });
  if (!result.ok) {
    // The provider's own wording ("openai returned 401 ...") is for the server log, not the counter.
    console.warn(`[import] AI column matching failed: ${result.reason}`);
    return { ok: false as const, error: "AI matching isn't working right now. Match the columns by hand." };
  }
  const suggestion = parseMappingSuggestion(result.text, batch.headers.length);
  if (!suggestion) return { ok: false as const, error: "AI couldn't match these columns reliably. Choose the columns below and preview them." };
  return { ok: true as const, ...suggestion };
}

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
