"use server";

/**
 * Photo-to-product for Quick Add.
 *
 * The browser snaps (or picks) a photo of a part and posts it here; a vision
 * model names it and guesses a category, which pre-fill the Quick Add fields for
 * the human to check. Like the voice path, it NEVER saves anything and the
 * person still presses Add.
 *
 * Nothing is stored — the image is described and dropped. The session is re-read
 * first, so only a signed-in shop user can spend the model call.
 */

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { consumeAiQuota } from "@/lib/ai/quota";
import { describeImage } from "@/lib/ai/vision";

export type IdentifyProductResult =
  | { ok: true; fields: { name: string; category: string | null } }
  | { ok: false; reason: string };

/** The client downscales before upload; this is a backstop against abuse. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "You identify ONE repair-shop part or product from a photo.",
  'Reply with ONLY a JSON object — no prose, no code fences: {"name":<string>,"category":<string|null>}.',
  '  name     = a short product title, e.g. "iPhone 6 Screen". "" if you cannot tell.',
  '  category = a broad group if obvious ("Screens","Batteries","Cases","Chargers"), else null.',
].join("\n");

const USER_PROMPT = "What repair-shop product is this? Return the JSON only.";

export async function identifyProductAction(
  formData: FormData,
): Promise<IdentifyProductResult> {
  const { shopId } = await requireUser();

  const image = formData.get("image");
  if (!(image instanceof Blob)) return { ok: false, reason: "No photo received." };
  if (image.size === 0) return { ok: false, reason: "The photo was empty." };
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "That photo is too large — try again." };
  }

  const quota = await consumeAiQuota(shopId, "vision");
  if (!quota.ok) return quota;

  const bytes = new Uint8Array(await image.arrayBuffer());
  const result = await describeImage({
    system: SYSTEM_PROMPT,
    prompt: USER_PROMPT,
    base64: toBase64(bytes),
    mediaType: image.type || "image/jpeg",
    maxTokens: 300,
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  const fields = extractFields(result.text);
  if (!fields) {
    return {
      ok: false,
      reason: "Couldn't identify that — try a clearer photo, or type it in.",
    };
  }
  return { ok: true, fields };
}

// ---------------------------------------------------------------------------

/** Portable base64 (no Node Buffer dependency), chunked to avoid arg limits. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const rawSchema = z.object({
  name: z.string(),
  category: z.union([z.string(), z.null()]).optional(),
});

function extractFields(
  text: string,
): { name: string; category: string | null } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = rawSchema.parse(JSON.parse(match[0]));
    const name = parsed.name.trim().slice(0, 160);
    if (!name) return null;
    const category =
      typeof parsed.category === "string" && parsed.category.trim()
        ? parsed.category.trim().slice(0, 80)
        : null;
    return { name, category };
  } catch {
    return null;
  }
}
