import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voice transcription config and driver (lib/ai/config.ts, lib/ai/transcribe.ts).
 *
 * Like the text providers, transcription is off unless STT_DRIVER names one, and
 * OpenAI / Groq / a custom endpoint all go through the one Whisper-shape POST —
 * asserted here from the env in, and the outgoing multipart request out.
 */

const { sttDriverName, sttEnabled, sttTarget } = await import("@/lib/ai/config");
const { transcribe } = await import("@/lib/ai/transcribe");

const STT_ENV = [
  "STT_DRIVER",
  "STT_MODEL",
  "STT_BASE_URL",
  "STT_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
] as const;

beforeEach(() => {
  for (const key of STT_ENV) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sttTarget", () => {
  it("is off by default", () => {
    expect(sttDriverName()).toBe("off");
    expect(sttEnabled()).toBe(false);
    expect(sttTarget()).toBeNull();
  });

  it("resolves OpenAI Whisper from the OpenAI key", () => {
    vi.stubEnv("STT_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(sttTarget()).toEqual({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk",
      model: "whisper-1",
    });
  });

  it("resolves Groq Whisper and honours STT_MODEL", () => {
    vi.stubEnv("STT_DRIVER", "groq");
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("STT_MODEL", "whisper-large-v3-turbo");
    expect(sttTarget()).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "g",
      model: "whisper-large-v3-turbo",
    });
  });

  it("needs STT_BASE_URL for a custom endpoint", () => {
    vi.stubEnv("STT_DRIVER", "custom");
    expect(sttTarget()).toBeNull();
    vi.stubEnv("STT_BASE_URL", "https://stt.local/v1/");
    vi.stubEnv("STT_API_KEY", "k");
    expect(sttTarget()).toMatchObject({ baseUrl: "https://stt.local/v1", apiKey: "k" });
  });
});

describe("transcribe", () => {
  it("posts the audio to /audio/transcriptions and returns the text", async () => {
    vi.stubEnv("STT_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    const fetchMock = stubFetch({ text: "add ten iphone screens" });

    const result = await transcribe(
      new Blob(["x"], { type: "audio/webm" }),
      "command.webm",
    );

    expect(result).toEqual({ ok: true, text: "add ten iphone screens" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("fails clearly when transcription isn't configured", async () => {
    const result = await transcribe(new Blob(["x"]), "c.webm");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("STT_DRIVER");
  });

  it("fails when the provider key is missing", async () => {
    vi.stubEnv("STT_DRIVER", "openai");
    const result = await transcribe(new Blob(["x"]), "c.webm");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("not set");
  });

  it("surfaces a provider error status", async () => {
    vi.stubEnv("STT_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    stubFetch({ error: "bad" }, { ok: false, status: 401 });
    const result = await transcribe(new Blob(["x"]), "c.webm");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("401");
  });
});
