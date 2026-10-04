import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What ASSISTANT_ROUTER actually does, so lib/ai/jev.ts and .env.example stay
 * honest about it:
 *
 *   unset  Jev only when no text AI provider is configured (the fallback)
 *   jev    Jev first, even when a text provider is configured
 *   off    never Jev, even as the fallback; the key can stay set
 */

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("@/lib/ai", () => ({ generate: generateMock }));

const { jevConfigured } = await import("@/lib/ai/jev");
const { interpretCommand } = await import("@/lib/ai/assistant");

const context = { statuses: ["New", "In Progress"], currentTicketNumber: null, history: [] };
const choice = (value: string) => ({ type: "choice", choice: value, confidence: 0.9, probabilities: { [value]: 0.9 } });
const noul = (p: number) => ({ type: "noul", noul: p });

/** Jev answering "what's running low" for every question it is asked. */
function jevAnswersLowStock() {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        answers: {
          action: choice("low_stock"),
          status: choice("none"),
          period: choice("today"),
          day: choice("today"),
          page: choice("dashboard"),
          mine: noul(0.05),
          overdue: noul(0.05),
          unpaid: noul(0.05),
          names_person: noul(0.05),
        },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "ts_test");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_DRIVER", "off");
  vi.stubEnv("ASSISTANT_ROUTER", "");
  generateMock.mockReset();
  generateMock.mockResolvedValue({ ok: false, reason: "AI is not configured" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ASSISTANT_ROUTER", () => {
  it("unset: with no text provider, Jev is the fallback", async () => {
    const fetchMock = jevAnswersLowStock();

    expect(jevConfigured()).toBe(true);
    expect(await interpretCommand("what's running low", context)).toEqual({ ok: true, intent: { action: "low_stock" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unset: with a text provider, the full interpreter is used and Jev is not asked", async () => {
    vi.stubEnv("AI_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk_test");
    const fetchMock = jevAnswersLowStock();
    generateMock.mockResolvedValue({ ok: true, text: '{"intent":{"action":"low_stock"}}' });

    expect(jevConfigured()).toBe(true);
    await interpretCommand("what's running low", context);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("jev: Jev is asked first even with a text provider", async () => {
    vi.stubEnv("ASSISTANT_ROUTER", "JEV");
    vi.stubEnv("AI_DRIVER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk_test");
    const fetchMock = jevAnswersLowStock();

    expect(await interpretCommand("what's running low", context)).toEqual({ ok: true, intent: { action: "low_stock" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("off: Jev is never used, even as the fallback, and the key can stay set", async () => {
    vi.stubEnv("ASSISTANT_ROUTER", " Off ");
    const fetchMock = jevAnswersLowStock();

    expect(jevConfigured()).toBe(false);
    const result = await interpretCommand("what's running low", context);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "AI is not configured" });
  });
});
