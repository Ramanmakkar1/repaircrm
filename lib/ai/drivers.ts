/**
 * Text-generation drivers.
 *
 * No SDKs — each provider is one plain `fetch` against a documented REST
 * endpoint, exactly like lib/comms/drivers.ts. Nothing to keep in sync with a
 * dependency tree, and the whole wire format is visible on one screen.
 *
 * Drivers never throw. They return `{ ok: false, reason }` with a sentence a
 * front-desk person can act on ("Ollama isn't running") rather than a stack
 * trace, because the reason goes straight into a toast.
 */

import { AI_TIMEOUT_MS, aiModel, ollamaUrl, type OpenAiTarget } from "./config";
import type { AiResult } from "./types";

export type GenerateInput = {
  system: string;
  prompt: string;
  maxTokens: number;
};

/** One line, no newlines, bounded — this lands in a toast. */
function reason(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * `fetch` reports every transport problem as the same opaque "fetch failed",
 * with the real story on `error.cause`. Nothing refuses a connection more often
 * than a local Ollama that isn't running, so that case gets named explicitly.
 */
function transportReason(error: unknown, label: string): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `${label} timed out after ${AI_TIMEOUT_MS / 1000}s`;
  }
  const code =
    error instanceof Error &&
    typeof (error.cause as { code?: unknown } | undefined)?.code === "string"
      ? ((error.cause as { code: string }).code)
      : "";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `${label} is unreachable (${code})`;
  }
  return reason(
    error instanceof Error ? `${label}: ${error.message}` : `${label}: unknown error`,
  );
}

// ---------------------------------------------------------------------------
// Anthropic — POST /v1/messages
// ---------------------------------------------------------------------------

/** One block of Anthropic's `content` array; only text blocks carry a draft. */
type AnthropicBlock = { type?: string; text?: string };

export async function generateAnthropic(input: GenerateInput): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "ANTHROPIC_API_KEY is not set" };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel("claude-haiku-4-5-20251001"),
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: reason(`Anthropic returned ${response.status} ${detail}`),
      };
    }

    const payload = (await response.json()) as { content?: AnthropicBlock[] };
    // A response can interleave several blocks; only the text ones are the draft.
    const text = (payload.content ?? [])
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("")
      .trim();

    if (!text) return { ok: false, reason: "Anthropic returned an empty draft" };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: transportReason(error, "Anthropic") };
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible — POST {baseUrl}/chat/completions
// ---------------------------------------------------------------------------

/** One choice in an OpenAI chat response; only the message content is the draft. */
type OpenAiChoice = { message?: { content?: string } };

/**
 * The one driver for every hosted model that speaks OpenAI's chat/completions
 * shape — OpenAI itself, GLM/Zhipu, Groq, DeepSeek, OpenRouter, or any custom
 * endpoint. They differ only by the `target` (base URL, key, model) resolved in
 * config.ts, which is why experimenting across them needs no new code here.
 *
 * `target.name` names the provider in every failure message, so a 401 from GLM
 * reads "glm returned 401", not a generic "AI error" — the toast has to tell a
 * front-desk person which key to check.
 */
export async function generateOpenAiCompatible(
  input: GenerateInput,
  target: OpenAiTarget,
): Promise<AiResult> {
  if (!target.apiKey) {
    return { ok: false, reason: `${target.name} API key is not set` };
  }

  try {
    const response = await fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${target.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: target.model,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: reason(`${target.name} returned ${response.status} ${detail}`),
      };
    }

    const payload = (await response.json()) as { choices?: OpenAiChoice[] };
    const text = (payload.choices?.[0]?.message?.content ?? "").trim();

    if (!text) return { ok: false, reason: `${target.name} returned an empty draft` };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: transportReason(error, target.name) };
  }
}

// ---------------------------------------------------------------------------
// Ollama — POST /api/generate
// ---------------------------------------------------------------------------

export async function generateOllama(input: GenerateInput): Promise<AiResult> {
  try {
    const response = await fetch(`${ollamaUrl()}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: aiModel("qwen3"),
        // /api/generate has no separate system field in this call shape, so the
        // instructions ride at the top of the prompt.
        prompt: `${input.system}\n\n${input.prompt}`,
        stream: false,
        // Reasoning models must NOT think here. Measured on qwen3:14b: with
        // thinking on the call takes 95s and comes back with an EMPTY
        // `response`, because the whole token budget went to the scratchpad
        // that Ollama returns in a separate `thinking` field. With it off the
        // same draft lands in ~7s. Ollama accepts (and ignores) this flag on
        // models that can't think, so it is safe to send unconditionally.
        think: false,
        options: { num_predict: input.maxTokens },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: reason(`Ollama returned ${response.status} ${detail}`),
      };
    }

    const payload = (await response.json()) as { response?: unknown };
    const raw = typeof payload.response === "string" ? payload.response : "";

    // Belt and braces for older Ollama builds, which inline the scratchpad as
    // <think> blocks in `response` rather than splitting it into its own field.
    // That is not the draft, and pasting it into a customer email would be
    // memorable for the wrong reasons.
    const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    if (!text) return { ok: false, reason: "Ollama returned an empty draft" };
    return { ok: true, text };
  } catch (error) {
    const message = transportReason(error, "Ollama");
    return {
      ok: false,
      reason: message.includes("unreachable")
        ? "Ollama is not running — start it with `ollama serve`"
        : message,
    };
  }
}
