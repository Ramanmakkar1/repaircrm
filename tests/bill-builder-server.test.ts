import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const { loadOpenRepairs, loadRecentCustomerIds } = await import("@/components/billing/bill/server");

/**
 * The two queries behind the bill builder (who was billed lately, and which
 * repairs are open) read tenant data, so every one of them has to carry the
 * session's shopId (lib/db.ts), including the lookup of a repair the page was
 * opened for by id.
 */

const SHOP = "shop_1";

beforeEach(() => resetDb());

describe("loadRecentCustomerIds", () => {
  it("lists the people billed most recently first, then those checked in, each once", async () => {
    handlers["invoice.findMany"] = () => [{ customerId: "c3" }, { customerId: "c1" }, { customerId: "c3" }];
    handlers["ticket.findMany"] = () => [{ customerId: "c1" }, { customerId: "c9" }];
    expect(await loadRecentCustomerIds(SHOP, "invoice")).toEqual(["c3", "c1", "c9"]);
  });

  it("reads estimates for an estimate and invoices for an invoice, never the other", async () => {
    handlers["invoice.findMany"] = () => [{ customerId: "inv" }];
    handlers["estimate.findMany"] = () => [{ customerId: "est" }];
    handlers["ticket.findMany"] = () => [];
    expect(await loadRecentCustomerIds(SHOP, "estimate")).toEqual(["est"]);
    expect(callsTo("invoice.findMany")).toEqual([]);
    expect(await loadRecentCustomerIds(SHOP, "invoice")).toEqual(["inv"]);
  });

  it("keeps only a handful, and filters every query by the shop", async () => {
    handlers["invoice.findMany"] = () => Array.from({ length: 30 }, (_, index) => ({ customerId: `c${index}` }));
    handlers["ticket.findMany"] = () => [];
    expect(await loadRecentCustomerIds(SHOP, "invoice")).toHaveLength(12);
    expect(whereOf("invoice.findMany")).toEqual({ shopId: SHOP });
    expect(whereOf("ticket.findMany")).toEqual({ shopId: SHOP });
  });
});

describe("loadOpenRepairs", () => {
  const repair = (id: string, number: number) => ({ id, number, subject: "Cracked screen", customerId: "c1", status: "In Progress" });

  it("is the shop's repairs that are not resolved, newest touched first, scoped to the shop", async () => {
    handlers["ticket.findMany"] = () => [repair("t1", 1015), repair("t2", 1016)];
    const repairs = await loadOpenRepairs(SHOP);
    expect(repairs.map((row) => row.id)).toEqual(["t1", "t2"]);
    expect(whereOf("ticket.findMany")).toMatchObject({ shopId: SHOP, status: { not: "Resolved" } });
    expect(callsTo("ticket.findMany")[0].args.orderBy).toEqual({ updatedAt: "desc" });
    expect(callsTo("ticket.findFirst")).toEqual([]);
  });

  it("always includes the repair the page was opened for, found by id AND shop", async () => {
    handlers["ticket.findMany"] = () => [repair("t1", 1015)];
    handlers["ticket.findFirst"] = () => repair("t7", 1007);
    const repairs = await loadOpenRepairs(SHOP, "t7");
    expect(repairs.map((row) => row.id)).toEqual(["t7", "t1"]);
    expect(whereOf("ticket.findFirst")).toEqual({ id: "t7", shopId: SHOP });
  });

  it("does not list it twice when it is already open, and ignores an id from another shop", async () => {
    handlers["ticket.findMany"] = () => [repair("t1", 1015)];
    handlers["ticket.findFirst"] = () => repair("t1", 1015);
    expect((await loadOpenRepairs(SHOP, "t1")).map((row) => row.id)).toEqual(["t1"]);
    handlers["ticket.findFirst"] = () => null; // not this shop's: the scoped lookup finds nothing
    expect((await loadOpenRepairs(SHOP, "elsewhere")).map((row) => row.id)).toEqual(["t1"]);
  });
});
