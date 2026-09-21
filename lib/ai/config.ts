/**
 * AI provider configuration.
 *
 * Same shape as lib/comms/config.ts: the driver is chosen entirely by
 * environment, so a call site works unchanged whether the shop is on a hosted
 * model, a local one, or none at all.
 *
 *   AI_DRIVER = off | anthropic | ollama | openai | glm | groq | deepseek | openrouter | custom
 *   AI_MODEL  = provider-specific model id (each provider has a sane default)
 *
 *   anthropic   ANTHROPIC_API_KEY
 *   openai      OPENAI_API_KEY
 *   glm         GLM_API_KEY        (Zhipu / BigModel — GLM-4.6, GLM-5)
 *   groq        GROQ_API_KEY
 *   deepseek    DEEPSEEK_API_KEY
 *   openrouter  OPENROUTER_API_KEY (one key, hundreds of models)
 *   custom      AI_API_KEY + AI_BASE_URL (any other OpenAI-compatible endpoint)
 *   ollama      OLLAMA_URL (default http://localhost:11434)
 *
 * EXPERIMENT-FRIENDLY. Every provider reads its OWN key, so a shop can keep
 * ANTHROPIC_API_KEY, OPENAI_API_KEY and GLM_API_KEY all set at once and switch
 * the live one by changing a single value, AI_DRIVER — no key gets moved or
 * deleted to try the next model. AI_BASE_URL overrides the endpoint for any
 * provider, so a new OpenAI-compatible model can be tried without a code change.
 *
 * DEFAULT IS "off", deliberately.
 *
 * lib/comms defaults to "log" because a misconfigured deploy printing an email
 * is harmless. AI is the opposite: these drivers are the only place in
 * RepairPilot that sends shop text to a third party, so that has to be an
 * explicit decision, never something a shop backs into because a key happened
 * to be present for some other reason. The one concession is that
 * ANTHROPIC_API_KEY *by itself* implies "anthropic" — setting a provider key is
 * already that explicit decision. Every other provider must be named in
 * AI_DRIVER, so adding an OPENAI_API_KEY for some unrelated feature can't
 * silently redirect where ticket text goes.
 */

import type { AiDriverName } from "./types";

const DRIVERS: readonly AiDriverName[] = [
  "off",
  "anthropic",
  "ollama",
  "openai",
  "glm",
  "groq",
  "deepseek",
  "openrouter",
  "custom",
];

/**
 * Unrecognised values fall back to "off" rather than to a provider: a typo in
 * `AI_DRIVER` must not decide, on its own, that shop text leaves the building.
 */
export function aiDriverName(): AiDriverName {
  const explicit = process.env.AI_DRIVER?.trim().toLowerCase();
  if (explicit) {
    return DRIVERS.includes(explicit as AiDriverName)
      ? (explicit as AiDriverName)
      : "off";
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "off";
}

/** True when the UI should offer AI affordances at all. */
export function aiEnabled(): boolean {
  return aiDriverName() !== "off";
}

export function aiModel(fallback: string): string {
  return process.env.AI_MODEL?.trim() || fallback;
}

export function ollamaUrl(): string {
  const raw = process.env.OLLAMA_URL?.trim() || "http://localhost:11434";
  return raw.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// OpenAI-compatible providers
// ---------------------------------------------------------------------------

/** The resolved target for one OpenAI-compatible call. */
export type OpenAiTarget = {
  /** The driver name, used only in error messages ("glm returned 401"). */
  name: string;
  /** Base URL, no trailing slash — "/chat/completions" is appended. */
  baseUrl: string;
  /** The provider's key, or null when it isn't set. */
  apiKey: string | null;
  /** The model id to request. */
  model: string;
};

/**
 * Presets for the hosted providers that all speak OpenAI's chat/completions
 * wire format. Adding a new one is a row here — no new driver code.
 */
const OPENAI_PROVIDERS: Record<
  string,
  { baseUrl: string; keyEnv: string; defaultModel: string }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyEnv: "GLM_API_KEY",
    defaultModel: "glm-4.6",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    keyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-4o-mini",
  },
};

/**
 * Resolves an OpenAI-compatible driver name to its endpoint, key and model, or
 * null when the name isn't one (anthropic/ollama/off take other paths).
 *
 * AI_BASE_URL overrides the endpoint for any provider, and "custom" is entirely
 * env-driven — that pair is what lets a brand-new model be tried without a code
 * change. AI_MODEL overrides the model for whichever provider is live.
 */
export function openAiTarget(name: AiDriverName): OpenAiTarget | null {
  const baseOverride = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");

  if (name === "custom") {
    if (!baseOverride) return null;
    return {
      name,
      baseUrl: baseOverride,
      apiKey: process.env.AI_API_KEY?.trim() || null,
      model: aiModel("gpt-4o-mini"),
    };
  }

  const preset = OPENAI_PROVIDERS[name];
  if (!preset) return null;
  return {
    name,
    baseUrl: baseOverride || preset.baseUrl,
    apiKey: process.env[preset.keyEnv]?.trim() || null,
    model: aiModel(preset.defaultModel),
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text (Whisper-style transcription)
// ---------------------------------------------------------------------------

/**
 * Cloud transcription for VOICE commands.
 *
 * The browser's own speech engine is strong for English but weak or absent for
 * spoken Hindi/Hinglish/Punjabi (and missing entirely on iPhone). A Whisper-
 * style endpoint fixes that: it auto-detects the language and handles code-
 * switching. OpenAI, Groq and others expose the SAME `POST /audio/transcriptions`
 * multipart shape, so — like the text providers — one driver serves them all.
 *
 *   STT_DRIVER = off (default) | openai | groq | custom
 *   STT_MODEL  = override (openai -> whisper-1, groq -> whisper-large-v3)
 *   openai/groq reuse OPENAI_API_KEY / GROQ_API_KEY
 *   custom     STT_API_KEY + STT_BASE_URL (any OpenAI-compatible transcription URL)
 *
 * Off by default and never implied by a key: turning voice audio into a request
 * to a third party has to be a deliberate choice, exactly like the text side.
 */
export type SttDriverName = "off" | "openai" | "groq" | "custom";

const STT_DRIVERS: readonly SttDriverName[] = ["off", "openai", "groq", "custom"];

const STT_PROVIDERS: Record<
  string,
  { baseUrl: string; keyEnv: string; defaultModel: string }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "whisper-1",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "whisper-large-v3",
  },
};

export function sttDriverName(): SttDriverName {
  const raw = process.env.STT_DRIVER?.trim().toLowerCase();
  return raw && STT_DRIVERS.includes(raw as SttDriverName)
    ? (raw as SttDriverName)
    : "off";
}

/** True when the UI should offer the cloud mic (spoken Punjabi/Hinglish). */
export function sttEnabled(): boolean {
  return sttDriverName() !== "off";
}

export type SttTarget = {
  name: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
};

/** Resolves the live transcription endpoint, key and model, or null when off. */
export function sttTarget(): SttTarget | null {
  const name = sttDriverName();
  if (name === "off") return null;

  const baseOverride = process.env.STT_BASE_URL?.trim().replace(/\/+$/, "");
  const modelOverride = process.env.STT_MODEL?.trim();

  if (name === "custom") {
    if (!baseOverride) return null;
    return {
      name,
      baseUrl: baseOverride,
      apiKey: process.env.STT_API_KEY?.trim() || null,
      model: modelOverride || "whisper-1",
    };
  }

  const preset = STT_PROVIDERS[name];
  if (!preset) return null;
  return {
    name,
    baseUrl: baseOverride || preset.baseUrl,
    apiKey: process.env[preset.keyEnv]?.trim() || null,
    model: modelOverride || preset.defaultModel,
  };
}

/**
 * Generation is on the critical path of a button the user is watching. Thirty
 * seconds is already past the point where they've decided it's broken — past
 * that, a clear failure beats a spinner.
 */
export const AI_TIMEOUT_MS = 30_000;
