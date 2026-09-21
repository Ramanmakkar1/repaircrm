"use server";

/**
 * Voice / natural-language capture for Quick Add.
 *
 * One job: turn a spoken (or typed) phrase — in ANY language — into the handful
 * of fields the Quick Add dialog shows, so the user can glance and confirm. It
 * NEVER creates the product itself; the human still presses Add. That is the
 * "review, then save" contract: a misheard "ten" vs "ninety" is caught by eyes
 * on the field, not discovered later as wrong stock.
 *
 * Like the ticket AI actions, this is read-only, persists nothing, and re-reads
 * the session first — a transcript arriving over the wire is only ever parsed
 * for a signed-in shop user.
 */

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { consumeAiQuota } from "@/lib/ai/quota";
import { generate } from "@/lib/ai";

export type VoiceProductFields = {
  name: string;
  category: string | null;
  /** A plain decimal string for the money input, e.g. "40" or "39.99". */
  price: string | null;
  /** A whole-number string for the quantity input, e.g. "10". */
  quantity: string | null;
};

export type VoiceParseResult =
  | { ok: true; fields: VoiceProductFields }
  | { ok: false; reason: string };

/** Generous — a model may reason a little before it emits the JSON. */
const MAX_TOKENS = 400;

/**
 * The model is told it may hear any language (English, Hindi, Hinglish,
 * Punjabi, …) and must still return the same JSON shape. It is told NEVER to
 * invent a price or quantity that wasn't said — a made-up number here becomes
 * wrong stock the moment the user trusts the field.
 */
const SYSTEM_PROMPT = [
  "You convert a repair-shop worker's sentence into ONE inventory product.",
  "The sentence may be in any language (English, Hindi, Hinglish, Punjabi, etc.).",
  "",
  "Reply with ONLY a JSON object — no prose, no markdown, no code fences — with exactly these keys:",
  '  "name":     string. The product as a short title, e.g. "iPhone 6 Screen". Keep well-known product/brand words in English. Required.',
  '  "category": string or null. A broad group if obvious ("Screens", "Batteries", "Chargers", "Cases"), else null.',
  '  "price":    number or null. The SELLING price if stated ("forty dollars" -> 40, "for 39.99" -> 39.99). null if not said.',
  '  "quantity": integer or null. How many are in stock if stated ("ten"/"das"/"dus" -> 10, "add 40" -> 40). null if not said.',
  "",
  "Rules:",
  "- Numbers spoken as words (in any language) become digits.",
  "- NEVER invent a price or quantity that was not said. Use null.",
  '- If there is no product name, return {"name":""}.',
  "",
  "Examples:",
  "add inventory for iphone 6 screen, ten in stock, sell for forty",
  '{"name":"iPhone 6 Screen","category":"Screens","price":40,"quantity":10}',
  "chalis iphone 6 ke screen add karo",
  '{"name":"iPhone 6 Screen","category":"Screens","price":null,"quantity":40}',
  "samsung s21 battery times three",
  '{"name":"Samsung S21 Battery","category":"Batteries","price":null,"quantity":3}',
].join("\n");

export async function parseProductVoiceAction(
  transcript: string,
): Promise<VoiceParseResult> {
  const { shopId } = await requireUser();

  const clean = transcript.trim().slice(0, 500);
  if (!clean) return { ok: false, reason: "I didn't catch that — try again." };

  const quota = await consumeAiQuota(shopId, "text");
  if (!quota.ok) return quota;

  const result = await generate({
    system: SYSTEM_PROMPT,
    prompt: clean,
    maxTokens: MAX_TOKENS,
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  const fields = extractFields(result.text);
  if (!fields) {
    return {
      ok: false,
      reason:
        'Couldn\'t make sense of that — try e.g. "iPhone 6 screen, ten in stock, forty dollars".',
    };
  }
  return { ok: true, fields };
}

// ---------------------------------------------------------------------------

/** Accepts a number, a numeric string, or null — models mix the two. */
const rawSchema = z.object({
  name: z.string(),
  category: z.union([z.string(), z.null()]).optional(),
  price: z.union([z.number(), z.string(), z.null()]).optional(),
  quantity: z.union([z.number(), z.string(), z.null()]).optional(),
});

/**
 * Pulls the JSON object out of the model's reply and normalises it to strings
 * the form inputs can hold. Returns null when there's no usable product name —
 * that is the one field Quick Add can't do without.
 */
function extractFields(text: string): VoiceProductFields | null {
  // Even told not to, a model will sometimes wrap the object in prose or fences;
  // the first {...} block is the payload.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: z.infer<typeof rawSchema>;
  try {
    parsed = rawSchema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }

  const name = parsed.name.trim().slice(0, 160);
  if (!name) return null;

  return {
    name,
    category: cleanCategory(parsed.category),
    price: cleanPrice(parsed.price),
    quantity: cleanQuantity(parsed.quantity),
  };
}

function cleanCategory(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 80) : null;
}

/** "$40" / "40" / 40 -> "40"; anything without a digit -> null. */
function cleanPrice(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/[^0-9.]/g, "");
  return /\d/.test(digits) ? digits : null;
}

/** "ten" is already digits by now; keep a non-negative whole number or null. */
function cleanQuantity(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const n = Math.trunc(Number(String(value).replace(/[^0-9-]/g, "")));
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}
