/**
 * Shared AI types.
 *
 * These live in their own module (not in index.ts) so a Client Component can
 * `import type { AiResult } from "@/lib/ai/types"` without dragging the driver
 * code — and its `process.env` reads — anywhere near the browser bundle.
 */

/**
 * Every AI call answers with this. There is no throwing path and no `null`:
 * a missing API key, a refused connection and a provider 500 are all the same
 * kind of event to the person clicking the button — the draft didn't arrive,
 * and here is the one line explaining why.
 */
export type AiResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Every text-generation backend the app can be pointed at.
 *
 *   off         no AI (default)
 *   anthropic   Claude, native Messages API
 *   ollama      a local model, native Ollama API
 *   openai · glm · groq · deepseek · openrouter
 *               hosted models that all speak the OpenAI "chat/completions"
 *               shape — one driver serves them, they differ only by base URL,
 *               key and model (see lib/ai/config.ts)
 *   custom      any other OpenAI-compatible endpoint, via AI_BASE_URL/AI_API_KEY
 *
 * Several keys can live in the environment at once; AI_DRIVER picks which is
 * live, so a shop can flip between them to see which answers best.
 */
export type AiDriverName =
  | "off"
  | "anthropic"
  | "ollama"
  | "openai"
  | "glm"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "custom";

/** The three shapes a customer-facing repair update actually takes. */
export type DraftTone = "update" | "ready" | "delay";

export const DRAFT_TONES: readonly DraftTone[] = ["update", "ready", "delay"];

export const DRAFT_TONE_LABEL: Record<DraftTone, string> = {
  update: "Progress update",
  ready: "Ready for pickup",
  delay: "Delay / waiting",
};

export function asDraftTone(value: unknown): DraftTone {
  return DRAFT_TONES.includes(value as DraftTone)
    ? (value as DraftTone)
    : "update";
}
