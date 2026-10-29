import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("@/lib/events", () => ({ emitLeadEvent: vi.fn() }));

const { POST } = await import("@/app/api/leads/route");

function post(body: Record<string, string>) {
  return POST(new Request("https://example.test/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  resetDb();
  handlers["shop.findUnique"] = () => ({ id: "shop_1" });
  handlers["lead.count"] = () => 0;
  handlers["lead.create"] = () => ({ id: "lead_1" });
});

describe("POST /api/leads", () => {
  it("refuses an email that is not one, rather than storing a lead nobody can answer", async () => {
    const response = await post({ shop: "demo", name: "Sam", email: "not-an-email" });
    expect(response.status).toBe(400);
    expect(callsTo("lead.create")).toEqual([]);
  });

  it("still takes a real address, lower-cased, on the named shop", async () => {
    const response = await post({ shop: "demo", name: "Sam", email: "Sam@Example.com" });
    expect(response.status).toBe(201);
    expect(callsTo("lead.create")[0].args.data).toMatchObject({ shopId: "shop_1", email: "sam@example.com" });
  });
});
