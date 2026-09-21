import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Jev router (lib/ai/router.ts) and how interpretCommand uses it.
 *
 * TypeSafe's API is faked at the `fetch` level with the documented response
 * shape, so these pin OUR side of the contract: what we send, and what we do
 * with each kind of answer — act, ask, hand off for words, or fall back.
 */

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("@/lib/ai", () => ({ generate: generateMock }));

const { routeWithJev, ticketNumbers } = await import("@/lib/ai/router");
const { interpretCommand } = await import("@/lib/ai/assistant");

type Answers = Record<string, unknown>;
let lastBody: { model: string; state: Record<string, unknown>; questions: Record<string, unknown> } | null;

function jevSays(answers: Answers, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      lastBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify(status === 200 ? { model: "jev", answers, usage: {} } : { error: "x" }), {
        status,
      });
    }),
  );
}

const choice = (value: string, confidence = 0.9, probabilities: Record<string, number> = { [value]: confidence }) => ({
  type: "choice",
  choice: value,
  confidence,
  probabilities,
});
const noul = (p: number) => ({ type: "noul", noul: p });

function answers(overrides: Answers): Answers {
  return {
    action: choice("find_tickets"),
    status: choice("none"),
    period: choice("today"),
    day: choice("today"),
    page: choice("dashboard"),
    mine: noul(0.05),
    overdue: noul(0.05),
    unpaid: noul(0.05),
    names_person: noul(0.05),
    ...overrides,
  };
}

const context = { statuses: ["New", "In Progress", "Ready for Pickup", "Resolved"], currentTicketNumber: null, history: [] };

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "ts_test");
  vi.stubEnv("AI_DRIVER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "sk_test");
  generateMock.mockReset();
  lastBody = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("routeWithJev", () => {
  it("answers a look-up entirely from Jev, with the shop's own status", async () => {
    jevSays(answers({ status: choice("Ready for Pickup") }));
    const routed = await routeWithJev("what's ready to collect", context);
    expect(routed).toMatchObject({
      kind: "intent",
      intent: { action: "find_tickets", status: "Ready for Pickup", overdue: false, mine: false },
    });
    expect(lastBody?.model).toBe("jev-latest");
    // The shop's statuses are the options — Jev can't invent one.
    expect(Object.keys((lastBody?.questions.status as { criteria: object }).criteria)).toEqual([
      "none",
      "New",
      "In Progress",
      "Ready for Pickup",
      "Resolved",
    ]);
  });

  it("reads the ticket number with code and the status with Jev", async () => {
    jevSays(answers({ action: choice("set_ticket_status"), status: choice("In Progress") }));
    expect(await routeWithJev("put 1007 in progress", context)).toMatchObject({
      kind: "intent",
      intent: { action: "set_ticket_status", ticket: 1007, status: "In Progress" },
    });
  });

  it("uses the ticket on screen for 'this one'", async () => {
    jevSays(answers({ action: choice("notify_ready") }));
    expect(await routeWithJev("tell them this one is ready", { ...context, currentTicketNumber: 1042 })).toMatchObject({
      kind: "intent",
      intent: { action: "notify_ready", ticket: 1042 },
    });
  });

  it("asks instead of guessing when Jev is unsure", async () => {
    jevSays(
      answers({
        action: choice("find_tickets", 0.41, { find_tickets: 0.41, notify_ready: 0.38, low_stock: 0.05 }),
      }),
    );
    const routed = await routeWithJev("ready one", context);
    expect(routed).toMatchObject({ kind: "intent", intent: { action: "clarify" } });
    expect(routed.kind === "intent" && "message" in routed.intent && routed.intent.message).toContain(
      "look up repairs, or tell a customer their repair is ready",
    );
  });

  it("hands anything needing words to the generative path", async () => {
    jevSays(answers({ action: choice("set_price") }));
    expect(await routeWithJev("iphone 6 screen is 45 now", context)).toEqual({
      kind: "needs_words",
      action: "set_price",
      confidence: 0.9,
    });
    // A named customer is words too.
    jevSays(answers({ action: choice("find_tickets"), names_person: noul(0.93) }));
    expect((await routeWithJev("john's repairs", context)).kind).toBe("needs_words");
  });

  it("refuses off-topic requests without calling anything else", async () => {
    jevSays(answers({ action: choice("not_about_shop") }));
    expect(await routeWithJev("write me a poem", context)).toMatchObject({ kind: "intent", intent: { action: "refuse" } });
  });

  it("reports an outage rather than throwing", async () => {
    jevSays({}, 529);
    expect((await routeWithJev("what's late", context)).kind).toBe("unavailable");
  });
});

describe("interpretCommand with Jev on", () => {
  it("never calls the generative model for a look-up", async () => {
    jevSays(answers({ action: choice("low_stock") }));
    expect(await interpretCommand("what's running low", context)).toEqual({ ok: true, intent: { action: "low_stock" } });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("tells the generative model which action Jev chose when words are needed", async () => {
    jevSays(answers({ action: choice("adjust_stock") }));
    generateMock.mockResolvedValue({
      ok: true,
      text: '{"action":"adjust_stock","product":"iPhone 6 Screen","amount":20}',
    });
    const result = await interpretCommand("got 20 iphone 6 screens in", context);
    expect(result).toEqual({ ok: true, intent: { action: "adjust_stock", product: "iPhone 6 Screen", amount: 20 } });
    expect(generateMock.mock.calls[0][0].prompt).toContain('"adjust_stock" action');
  });

  it("falls back to the generative model when Jev is down", async () => {
    jevSays({}, 401);
    generateMock.mockResolvedValue({ ok: true, text: '{"action":"low_stock"}' });
    expect(await interpretCommand("what's running low", context)).toEqual({ ok: true, intent: { action: "low_stock" } });
  });
});

describe("ticketNumbers", () => {
  it("reads ticket numbers but not prices", () => {
    expect(ticketNumbers("mark #1042 ready")).toEqual([1042]);
    expect(ticketNumbers("price it at $450")).toEqual([]);
    expect(ticketNumbers("set to 45.50")).toEqual([]);
    expect(ticketNumbers("call 780 555 0142")).toHaveLength(3);
  });
});
