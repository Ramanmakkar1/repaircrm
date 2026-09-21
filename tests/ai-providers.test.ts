import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Multi-provider AI configuration and routing.
 *
 * The behaviour worth protecting: several provider keys can sit in the
 * environment at once, AI_DRIVER alone decides which is live, an unknown driver
 * fails safe to "off" (shop text must never leave the building on a typo), and
 * every OpenAI-compatible provider hits the right URL with the right key and
 * model. All of that is decided from env + the request the driver builds, so the
 * tests set env and assert the outgoing fetch.
 */

const { aiDriverName, aiEnabled, openAiTarget } = await import("@/lib/ai/config");
const { generate } = await import("@/lib/ai");

const AI_ENV = [
  "AI_DRIVER",
  "AI_MODEL",
  "AI_BASE_URL",
  "AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GLM_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_URL",
] as const;

beforeEach(() => {
  for (const key of AI_ENV) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fetch stub that records its call and returns a canned response. */
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

function callArgs(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return {
    url,
    headers: (init.headers ?? {}) as Record<string, string>,
    body: JSON.parse(init.body as string) as {
      model: string;
      max_tokens: number;
      messages: { role: string; content: string }[];
    },
  };
}

describe("aiDriverName", () => {
  it("defaults to off, disabled, when nothing is set", () => {
    expect(aiDriverName()).toBe("off");
    expect(aiEnabled()).toBe(false);
  });

  it("implies anthropic from ANTHROPIC_API_KEY alone", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    expect(aiDriverName()).toBe("anthropic");
    expect(aiEnabled()).toBe(true);
  });

  it("lets an explicit AI_DRIVER pick a provider", () => {
    vi.stubEnv("AI_DRIVER", "glm");
    expect(aiDriverName()).toBe("glm");
  });

  it("falls back to off for an unknown driver, so a typo can't leak text", () => {
    vi.stubEnv("AI_DRIVER", "gpt9000");
    expect(aiDriverName()).toBe("off");
  });

  it("does NOT imply a provider from a non-anthropic key — that must be explicit", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    expect(aiDriverName()).toBe("off");
  });
});

describe("openAiTarget", () => {
  it("resolves the OpenAI preset with its key", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    expect(openAiTarget("openai")).toEqual({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai",
      model: "gpt-4o-mini",
    });
  });

  it("resolves GLM and honours an AI_MODEL override", () => {
    vi.stubEnv("GLM_API_KEY", "glm-key");
    vi.stubEnv("AI_MODEL", "glm-5");
    expect(openAiTarget("glm")).toMatchObject({
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "glm-key",
      model: "glm-5",
    });
  });

  it("lets AI_BASE_URL override the endpoint, trailing slash trimmed", () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("AI_BASE_URL", "https://proxy.test/v1/");
    expect(openAiTarget("openai")?.baseUrl).toBe("https://proxy.test/v1");
  });

  it("needs AI_BASE_URL for a custom endpoint", () => {
    expect(openAiTarget("custom")).toBeNull();
    vi.stubEnv("AI_BASE_URL", "https://llm.local/v1");
    vi.stubEnv("AI_API_KEY", "local-key");
    expect(openAiTarget("custom")).toMatchObject({
      baseUrl: "https://llm.local/v1",
      apiKey: "local-key",
    });
  });

  it("returns null for the non-OpenAI drivers", () => {
    expect(openAiTarget("anthropic")).toBeNull();
    expect(openAiTarget("ollama")).toBeNull();
    expect(openAiTarget("off")).toBeNull();
  });

  it("reports a null key when the provider's key is absent", () => {
    expect(openAiTarget("openai")?.apiKey).toBeNull();
  });
});

describe("generate routing", () => {
  it("is off by default", async () => {
    const result = await generate({ system: "S", prompt: "P", maxTokens: 10 });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("not configured");
  });

  it("posts to the OpenAI endpoint and returns the message", async () => {
    vi.stubEnv("AI_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = stubFetch({ choices: [{ message: { content: "hi there" } }] });

    const result = await generate({ system: "S", prompt: "P", maxTokens: 50 });

    expect(result).toEqual({ ok: true, text: "hi there" });
    const { url, headers, body } = callArgs(fetchMock);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headers.authorization).toBe("Bearer sk-test");
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "P" },
    ]);
  });

  it("routes GLM to its endpoint with the chosen model", async () => {
    vi.stubEnv("AI_DRIVER", "glm");
    vi.stubEnv("GLM_API_KEY", "glm-key");
    vi.stubEnv("AI_MODEL", "glm-5");
    const fetchMock = stubFetch({ choices: [{ message: { content: "ਹਾਂ ਜੀ" } }] });

    const result = await generate({ system: "S", prompt: "P", maxTokens: 50 });

    expect(result).toEqual({ ok: true, text: "ਹਾਂ ਜੀ" });
    const { url, headers, body } = callArgs(fetchMock);
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(headers.authorization).toBe("Bearer glm-key");
    expect(body.model).toBe("glm-5");
  });

  it("fails clearly when the live provider's key is missing, without a request", async () => {
    vi.stubEnv("AI_DRIVER", "openai");
    const fetchMock = stubFetch({});

    const result = await generate({ system: "S", prompt: "P", maxTokens: 50 });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a provider error status in the reason", async () => {
    vi.stubEnv("AI_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    stubFetch({ error: "bad key" }, { ok: false, status: 401 });

    const result = await generate({ system: "S", prompt: "P", maxTokens: 50 });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("401");
  });
});
