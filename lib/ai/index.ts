/**
 * Text generation.
 *
 * ONE WAY OUT
 * -----------
 * Every AI call in the app goes through `generate()`. That matters more here
 * than it does for email: this is the only code path that hands RepairFlow's
 * ticket text to a third party, so it is the only place that needs auditing for
 * what actually leaves — and the only place that can be switched off.
 *
 *   - Never throws. Callers are Server Actions behind a button; a provider
 *     having a bad afternoon produces a toast, not a 500.
 *   - Nothing is persisted. Drafts land in a textarea a human edits and sends;
 *     summaries are read once and discarded. There is no AI row in the schema
 *     and no silent audit trail of prompts.
 *
 * WHAT IS NEVER SENT — see ./ticket-context.ts, which is the only builder of
 * prompt bodies in the app. Customer email, phone, mobile, postal address, last
 * name and business name are excluded, as are device serials and the unlock
 * code captured at intake. Free text gets a redaction pass on the way out.
 */

import { aiDriverName } from "./config";
import { generateAnthropic, generateOllama, type GenerateInput } from "./drivers";
import type { AiResult } from "./types";

export { aiDriverName, aiEnabled } from "./config";
export type { AiResult, DraftTone } from "./types";
export {
  asDraftTone,
  DRAFT_TONES,
  DRAFT_TONE_LABEL,
} from "./types";

const NOT_CONFIGURED =
  "AI is not configured — set AI_DRIVER/ANTHROPIC_API_KEY";

export async function generate(input: GenerateInput): Promise<AiResult> {
  switch (aiDriverName()) {
    case "anthropic":
      return generateAnthropic(input);
    case "ollama":
      return generateOllama(input);
    case "off":
    default:
      return { ok: false, reason: NOT_CONFIGURED };
  }
}
