/**
 * The inventory assistant's brain.
 *
 * WHAT MAKES IT SAFE
 * ------------------
 * The model never runs anything. It only chooses ONE of a fixed set of intents
 * (add / search / remove a product, or clarify / refuse) and fills in typed
 * arguments. The server then decides what to do with that intent. So there is no
 * path from "the user said something" to "arbitrary code ran": the assistant
 * cannot write code, open a URL, or touch anything outside this shop's
 * inventory, because there is no intent for those — the only honest answer it
 * can give to "build me a website" is `refuse`.
 *
 * This also keeps it provider-agnostic. Rather than each model's native
 * tool-calling format, the assistant asks for a plain JSON object and validates
 * it here, so Claude, GPT, GLM or a local model all drive it through the exact
 * same code path (see lib/ai/config.ts for the driver switch).
 *
 * Destructive intents (remove) are STAGED, not run — the server hands them back
 * for a one-tap confirm (see app/(app)/assistant/actions.ts). A misheard
 * "delete everything" can never erase data on its own.
 */

import { z } from "zod";

import { generate } from "./index";

const MAX_TOKENS = 400;

const DIDNT_UNDERSTAND =
  "I didn't catch that — try e.g. “add 10 iPhone 6 screens” or “find iPhone batteries”.";

// ---------------------------------------------------------------------------
// Intents — the ONLY things the assistant can ask for
// ---------------------------------------------------------------------------

const addProduct = z.object({
  action: z.literal("add_product"),
  name: z.string().min(1).max(160),
  price: z.number().nonnegative().nullable().optional(),
  quantity: z.number().int().nonnegative().nullable().optional(),
  category: z.string().max(80).nullable().optional(),
});

const searchProducts = z.object({
  action: z.literal("search_products"),
  query: z.string().min(1).max(160),
});

const adjustStock = z.object({
  action: z.literal("adjust_stock"),
  product: z.string().min(1).max(160),
  // Signed: +N receives/restocks, -N removes.
  amount: z.number().int(),
});

const setStock = z.object({
  action: z.literal("set_stock"),
  product: z.string().min(1).max(160),
  count: z.number().int().nonnegative(),
});

const setPrice = z.object({
  action: z.literal("set_price"),
  product: z.string().min(1).max(160),
  // Selling price in dollars.
  price: z.number().nonnegative(),
});

const lowStock = z.object({
  action: z.literal("low_stock"),
});

const findTickets = z.object({
  action: z.literal("find_tickets"),
  status: z.string().max(60).nullable().optional(),
  customer: z.string().max(120).nullable().optional(),
});

const removeProduct = z.object({
  action: z.literal("remove_product"),
  product: z.string().min(1).max(160),
});

const clarify = z.object({
  action: z.literal("clarify"),
  message: z.string().min(1).max(300),
});

const refuse = z.object({
  action: z.literal("refuse"),
  message: z.string().min(1).max(300),
});

export const assistantIntentSchema = z.discriminatedUnion("action", [
  addProduct,
  searchProducts,
  adjustStock,
  setStock,
  setPrice,
  lowStock,
  findTickets,
  removeProduct,
  clarify,
  refuse,
]);

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

/** Intents the server must NOT run without a human's confirm. */
export function isDestructive(intent: AssistantIntent): boolean {
  return intent.action === "remove_product";
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are RepairPilot's assistant for a repair shop. You help staff manage the",
  "shop's inventory and look up its repair tickets, and NOTHING else.",
  "",
  "Reply with EXACTLY ONE JSON object and no other text — no prose, no markdown,",
  'no code fences. Its "action" is one of:',
  "",
  '{"action":"add_product","name":<string>,"price":<number|null>,"quantity":<integer|null>,"category":<string|null>}',
  "  Create a new product. price = selling price in dollars if stated else null.",
  "  quantity = opening stock if stated else null. category if obvious else null.",
  "",
  '{"action":"search_products","query":<string>}',
  "  Look up products by name or keyword.",
  "",
  '{"action":"adjust_stock","product":<string>,"amount":<integer>}',
  '  Change a product\'s stock by a signed amount. "add/receive 20" -> 20,',
  '  "remove/reduce 3" -> -3. Use this for restocking an EXISTING product.',
  "",
  '{"action":"set_stock","product":<string>,"count":<integer>}',
  '  Set a product\'s stock to an exact count. "set stock to 50" -> 50.',
  "",
  '{"action":"set_price","product":<string>,"price":<number>}',
  '  Set a product\'s selling price in dollars. "price it at 45" -> 45.',
  "",
  '{"action":"low_stock"}',
  "  List products at or below their reorder point (what needs restocking).",
  "",
  '{"action":"find_tickets","status":<string|null>,"customer":<string|null>}',
  '  List repair tickets. status e.g. "Ready for Pickup", "In Progress"; customer',
  "  = a person's name. null for whichever wasn't said.",
  "",
  '{"action":"remove_product","product":<string>}',
  "  Remove/hide a product the user names. (The app asks the user to confirm.)",
  "",
  '{"action":"clarify","message":<string>}',
  "  The command IS about inventory but something is missing (which product, what",
  "  name). Ask one short question.",
  "",
  '{"action":"refuse","message":<string>}',
  "  ANYTHING not about this shop's inventory or repairs — writing code, building",
  "  a website, general questions, chit-chat, math, other software. Politely say",
  "  you only help with the shop's inventory and repairs.",
  "",
  "Rules:",
  "- The command may be in ANY language (English, Hindi, Hinglish, Punjabi, …).",
  "  Understand it; keep product/brand names in their common form (iPhone 6 Screen).",
  "- Numbers spoken as words become digits.",
  "- Ignore filler words, stutters, repeated words and harmless spelling mistakes.",
  "- Honour explicit self-corrections: 'ten, sorry twelve' means twelve; never add both.",
  "- If a correction or product identity is ambiguous, ask one short clarification instead of guessing.",
  "- A request with several independent changes needs clarification; do not silently execute just one.",
  "- NEVER invent a price or quantity that was not said — use null.",
  "- Output ONE JSON object only.",
  "",
  "Examples:",
  "add 40 iphone 6 screens",
  '{"action":"add_product","name":"iPhone 6 Screen","price":null,"quantity":40,"category":"Screens"}',
  "chalis samsung s21 battery add karo, 25 dollar each",
  '{"action":"add_product","name":"Samsung S21 Battery","price":25,"quantity":40,"category":"Batteries"}',
  "how many iphone screens do we have",
  '{"action":"search_products","query":"iPhone screen"}',
  "add 20 to iphone 6 screens",
  '{"action":"adjust_stock","product":"iPhone 6 Screen","amount":20}',
  "remove 3 samsung batteries from stock",
  '{"action":"adjust_stock","product":"Samsung Battery","amount":-3}',
  "set iphone 6 screen stock to 50",
  '{"action":"set_stock","product":"iPhone 6 Screen","count":50}',
  "change iphone 6 screen price to 45",
  '{"action":"set_price","product":"iPhone 6 Screen","price":45}',
  "what's running low",
  '{"action":"low_stock"}',
  "what's ready for pickup",
  '{"action":"find_tickets","status":"Ready for Pickup","customer":null}',
  "show me john's repairs",
  '{"action":"find_tickets","status":null,"customer":"John"}',
  "delete the iphone 6 screen",
  '{"action":"remove_product","product":"iPhone 6 Screen"}',
  "write me a website",
  '{"action":"refuse","message":"I can only help with your shop\'s inventory — adding, finding, or removing products."}',
  "what's the capital of France",
  '{"action":"refuse","message":"I only help manage this shop\'s inventory."}',
].join("\n");

// ---------------------------------------------------------------------------
// Parse + interpret
// ---------------------------------------------------------------------------

/**
 * Pulls the JSON intent out of the model's reply and validates it. Anything
 * unparseable or not matching the schema becomes a `clarify` — the assistant
 * asks again rather than guessing an action, and an unknown/garbled reply can
 * never map onto a real operation.
 */
export function parseIntent(text: string): AssistantIntent {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = assistantIntentSchema.safeParse(JSON.parse(match[0]));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to clarify
    }
  }
  return { action: "clarify", message: DIDNT_UNDERSTAND };
}

export type InterpretResult =
  | { ok: true; intent: AssistantIntent }
  | { ok: false; reason: string };

/** Sends the command to the model and returns a validated intent. */
export async function interpretCommand(text: string): Promise<InterpretResult> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return { ok: false, reason: "Say or type a command first." };

  const result = await generate({
    system: ASSISTANT_SYSTEM_PROMPT,
    prompt: clean,
    maxTokens: MAX_TOKENS,
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  return { ok: true, intent: parseIntent(result.text) };
}
