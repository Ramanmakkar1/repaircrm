import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The vision driver (lib/ai/vision.ts).
 *
 * Routes by AI_DRIVER like the text side: Anthropic gets an `image` content
 * block, OpenAI-compatible providers get an `image_url` data URL, and a local
 * Ollama is told to use a cloud model. Asserted from the env in and the outgoing
 * request body out.
 */

const { describeImage } = await import("@/lib/ai/vision");

const AI_ENV = [
  "AI_DRIVER",
  "AI_MODEL",
  "AI_BASE_URL",
  "AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GLM_API_KEY",
] as const;

beforeEach(() => {
  for (const key of AI_ENV) vi.stubEnv(key, undefined);
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

const IMG = {
  system: "S",
  prompt: "P",
  base64: "AAAA",
  mediaType: "image/jpeg",
  maxTokens: 50,
};

describe("describeImage", () => {
  it("is off by default", async () => {
    const result = await describeImage(IMG);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("not configured");
  });

  it("sends an Anthropic image content block", async () => {
    vi.stubEnv("AI_DRIVER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    const fetchMock = stubFetch({
      content: [{ type: "text", text: '{"name":"iPhone 6 Screen","category":"Screens"}' }],
    });

    const result = await describeImage(IMG);

    expect(result).toMatchObject({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
    });
  });

  it("sends an OpenAI image_url data URL", async () => {
    vi.stubEnv("AI_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk");
    const fetchMock = stubFetch({
      choices: [{ message: { content: '{"name":"USB-C Cable","category":null}' } }],
    });

    const result = await describeImage(IMG);

    expect(result).toMatchObject({ ok: true, text: expect.stringContaining("USB-C") });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[1].content[1]).toMatchObject({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
  });

  it("tells a local Ollama to use a cloud model", async () => {
    vi.stubEnv("AI_DRIVER", "ollama");
    const result = await describeImage(IMG);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("cloud model");
  });
});
