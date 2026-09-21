import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", () => ({ db: fakeClient }));

import { SHOP_DAILY_LIMIT, consumeAiQuota } from "@/lib/ai/quota";

beforeEach(() => {
  resetDb();
  vi.restoreAllMocks();
});

const missingTable = () =>
  new Prisma.PrismaClientKnownRequestError("The table `public.UsageCounter` does not exist", {
    code: "P2021",
    clientVersion: "test",
  });

describe("consumeAiQuota", () => {
  it("counts the request against the shop and the platform", async () => {
    handlers["usageCounter.upsert"] = () => ({ count: 1 });
    expect(await consumeAiQuota("s1", "audio")).toEqual({ ok: true });
    const keys = callsTo("usageCounter.upsert").map((call) => (call.args.create as { shopId: string; key: string }).key);
    expect(keys.sort()).toEqual(["ai.all", "ai.audio"]);
  });

  it("refuses once the shop has used today's allowance", async () => {
    handlers["usageCounter.upsert"] = () => ({ count: SHOP_DAILY_LIMIT.audio + 1 });
    expect(await consumeAiQuota("s1", "audio")).toMatchObject({ ok: false });
  });

  it("lets the request through when the counter table was never migrated", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    handlers["usageCounter.upsert"] = () => {
      throw missingTable();
    };
    expect(await consumeAiQuota("s1", "text")).toEqual({ ok: true });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("db:deploy"));
  });

  it("still fails on any other database error", async () => {
    handlers["usageCounter.upsert"] = () => {
      throw new Error("connection refused");
    };
    await expect(consumeAiQuota("s1", "text")).rejects.toThrow("connection refused");
  });
});
