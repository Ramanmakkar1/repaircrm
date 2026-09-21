/**
 * Image understanding driver.
 *
 * The same shape as the text drivers, plus a base64 image on the message. It
 * routes by AI_DRIVER: Anthropic's Messages API takes an `image` content block,
 * every OpenAI-compatible provider takes an `image_url` data URL, and a local
 * Ollama is told to use a cloud model (vision on a small local model is rarely
 * good enough to trust for a shelf label). Never throws — a failure is a toast.
 */

import {
  AI_TIMEOUT_MS,
  aiDriverName,
  aiModel,
  openAiTarget,
  type OpenAiTarget,
} from "./config";
import type { AiResult } from "./types";

export type VisionInput = {
  system: string;
  prompt: string;
  /** Base64 image data (no data: prefix). */
  base64: string;
  /** e.g. "image/jpeg". */
  mediaType: string;
  maxTokens: number;
};

function reason(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

function failure(error: unknown, label: string): AiResult {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { ok: false, reason: `${label} timed out after ${AI_TIMEOUT_MS / 1000}s` };
  }
  return {
    ok: false,
    reason: reason(
      error instanceof Error ? `${label}: ${error.message}` : `${label}: unknown error`,
    ),
  };
}

export async function describeImage(input: VisionInput): Promise<AiResult> {
  const driver = aiDriverName();
  switch (driver) {
    case "off":
      return { ok: false, reason: "AI is not configured — set AI_DRIVER and a key" };
    case "anthropic":
      return anthropicVision(input);
    case "ollama":
      return {
        ok: false,
        reason: "Photo recognition needs a cloud model (Anthropic, OpenAI or GLM).",
      };
    default: {
      const target = openAiTarget(driver);
      if (!target) return { ok: false, reason: `AI provider "${driver}" is not configured` };
      return openAiVision(input, target);
    }
  }
}

async function anthropicVision(input: VisionInput): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "ANTHROPIC_API_KEY is not set" };

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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: input.mediaType, data: input.base64 },
              },
              { type: "text", text: input.prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: reason(`Anthropic returned ${response.status} ${detail}`) };
    }

    const payload = (await response.json()) as {
      content?: { type?: string; text?: string }[];
    };
    const text = (payload.content ?? [])
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "Anthropic returned an empty result" };
    return { ok: true, text };
  } catch (error) {
    return failure(error, "Anthropic");
  }
}

async function openAiVision(
  input: VisionInput,
  target: OpenAiTarget,
): Promise<AiResult> {
  if (!target.apiKey) return { ok: false, reason: `${target.name} API key is not set` };

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
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              {
                type: "image_url",
                image_url: { url: `data:${input.mediaType};base64,${input.base64}` },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: reason(`${target.name} returned ${response.status} ${detail}`) };
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = (payload.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return { ok: false, reason: `${target.name} returned an empty result` };
    return { ok: true, text };
  } catch (error) {
    return failure(error, target.name);
  }
}
