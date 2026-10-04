import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
const session = vi.hoisted(() => ({ value: { userId: "u1", shopId: "shop_1", role: "OWNER" } as Record<string, string> | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => session.value }));
const branch = vi.hoisted(() => ({ value: {} as { locationId?: string } }));
vi.mock("@/lib/location", () => ({ locationWhere: async () => branch.value }));

import { attentionItems, attentionTotal, countLabel, needsYouLabel, waitingItems } from "@/components/counter/attention";
import { loadAttentionCounts } from "@/components/counter/attention-data";
import { hubCountKeys, hubCountWords, loadHubCounts } from "@/app/(app)/counter/[area]/hub-counts";
import { TOUCH_WORKSPACES, workspaceActions, hubTilePhoto, workspacePhoto } from "@/lib/touch-workspace";

const { GET } = await import("@/app/api/app-search/attention/route");

function countAll(value: number) {
  for (const path of ["ticket.count", "lead.count", "invoice.count", "product.count", "estimate.count", "recurringInvoice.count", "customer.count", "purchaseOrder.count", "vendor.count", "appointment.count", "cashDrawerSession.count"]) {
    handlers[path] = () => value;
  }
}

describe("the Needs you list", () => {
  const counts = { ready: 2, overdue: 9, replies: 1, enquiries: 3, unpaid: 5, low: 0 };

  it("lists the six kinds, most urgent first, each opening its filtered list", () => {
    const items = attentionItems(counts, "OWNER");
    expect(items.map((item) => item.key)).toEqual(["ready", "replies", "overdue", "enquiries", "unpaid", "low"]);
    expect(items.find((item) => item.key === "replies")?.href).toBe("/tickets?status=needs-reply");
    expect(items.find((item) => item.key === "enquiries")?.href).toBe("/leads?status=NEW");
    expect(items.find((item) => item.key === "ready")?.href).toBe("/tickets?status=Ready%20for%20Pickup");
    expect(items.every((item) => item.photo.startsWith("/images/"))).toBe(true);
  });

  it("never shows a technician the money count", () => {
    expect(attentionItems(counts, "TECH").map((item) => item.key)).not.toContain("unpaid");
    expect(attentionTotal(attentionItems(counts, "TECH"))).toBe(15);
    expect(attentionTotal(attentionItems(counts, "OWNER"))).toBe(20);
  });

  it("drops the zeros for the sheet, and says the number in words for a screen reader", () => {
    expect(waitingItems(attentionItems(counts, "OWNER")).map((item) => item.key)).not.toContain("low");
    expect(needsYouLabel(0)).toBe("Needs you: nothing waiting");
    expect(needsYouLabel(1)).toBe("Needs you: 1 thing waiting");
    expect(needsYouLabel(20)).toBe("Needs you: 20 things waiting");
    expect(countLabel(140)).toBe("99+");
  });

  it("treats a missing or odd count as zero", () => {
    expect(attentionItems({ ready: -3, overdue: 2.7 }, "OWNER").slice(0, 3).map((item) => item.count)).toEqual([0, 0, 2]);
  });
});

describe("loading the counts", () => {
  beforeEach(() => {
    resetDb();
    countAll(4);
    handlers["$queryRaw"] = () => [{ id: "t1" }, { id: "t2" }];
  });

  it("scopes every query to the shop, and repairs and invoices to the chosen branch", async () => {
    const counts = await loadAttentionCounts({ shopId: "shop_1", role: "OWNER" }, { locationId: "loc_2" }, new Date("2026-10-04T18:00:00Z"));
    expect(counts).toEqual({ ready: 4, overdue: 4, replies: 2, enquiries: 4, unpaid: 4, low: 4 });
    for (const call of callsTo("ticket.count")) expect(call.args.where).toMatchObject({ shopId: "shop_1", locationId: "loc_2" });
    expect(whereOf("invoice.count")).toMatchObject({ shopId: "shop_1", locationId: "loc_2", status: { in: ["SENT", "PARTIAL"] } });
    expect(whereOf("lead.count")).toEqual({ shopId: "shop_1", status: "NEW" });
    expect(whereOf("product.count")).toMatchObject({ shopId: "shop_1", active: true });
    expect(callsTo("$queryRaw")[0].args.values).toContain("shop_1");
    expect(callsTo("$queryRaw")[0].args.values).toContain("loc_2");
  });

  it("does not run the money count for a technician", async () => {
    const counts = await loadAttentionCounts({ shopId: "shop_1", role: "TECH" }, {});
    expect(counts.unpaid).toBe(0);
    expect(callsTo("invoice.count")).toHaveLength(0);
    expect(whereOf("ticket.count")).not.toHaveProperty("locationId");
  });

  it("counts a repair as late from the instant it was due, not the server's day", async () => {
    const now = new Date("2026-10-04T05:30:00Z");
    await loadAttentionCounts({ shopId: "shop_1", role: "OWNER" }, {}, now);
    const late = callsTo("ticket.count").find((call) => "dueDate" in (call.args.where as object));
    expect((late?.args.where as { dueDate: { lt: Date } }).dueDate.lt).toEqual(now);
  });
});

describe("GET /api/app-search/attention", () => {
  beforeEach(() => {
    resetDb();
    countAll(1);
    handlers["$queryRaw"] = () => [];
    session.value = { userId: "u1", shopId: "shop_1", role: "OWNER" };
    branch.value = {};
  });

  it("answers the bell with the same items Home shows", async () => {
    handlers["user.findFirst"] = () => ({ active: true, role: "FRONT_DESK" });
    const res = await GET();
    const body = await res.json();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(whereOf("user.findFirst")).toEqual({ id: "u1", shopId: "shop_1" });
    expect(body.items.map((item: { key: string }) => item.key)).toContain("unpaid");
    expect(body.total).toBe(5);
  });

  it("uses the role in the database, not the one in the cookie", async () => {
    handlers["user.findFirst"] = () => ({ active: true, role: "TECH" });
    const body = await (await GET()).json();
    expect(body.items.map((item: { key: string }) => item.key)).not.toContain("unpaid");
    expect(callsTo("invoice.count")).toHaveLength(0);
  });

  it("answers 401 when signed out or deactivated", async () => {
    session.value = null;
    expect((await GET()).status).toBe(401);
    session.value = { userId: "u1", shopId: "shop_1", role: "OWNER" };
    handlers["user.findFirst"] = () => ({ active: false, role: "OWNER" });
    expect((await GET()).status).toBe(401);
  });
});

describe("hub tiles: distinct pictures and live numbers", () => {
  beforeEach(() => {
    resetDb();
    countAll(3);
  });

  it("gives every tile on a hub its own picture", () => {
    for (const [key, workspace] of Object.entries(TOUCH_WORKSPACES)) {
      const photos = workspaceActions(workspace, "OWNER").map((action) => `${hubTilePhoto(action, workspacePhoto(key))}|${action.mark ?? ""}`);
      expect(new Set(photos).size, key).toBe(photos.length);
    }
  });

  it("only asks for the numbers a hub shows, and never money for a technician", () => {
    expect(hubCountKeys(TOUCH_WORKSPACES.invoices.actions, "OWNER")).toEqual(["invoices-unpaid", "invoices-partial", "recurring-active", "estimates-open"]);
    expect(hubCountKeys(TOUCH_WORKSPACES.invoices.actions, "TECH")).toEqual([]);
    expect(hubCountKeys(TOUCH_WORKSPACES.repairs.actions, "TECH")).toEqual(["repairs-open", "repairs-ready", "repairs-overdue"]);
  });

  it("scopes each count to the shop (and branch where the record has one)", async () => {
    const counts = await loadHubCounts(["invoices-unpaid", "estimates-open", "enquiries-new", "drawers-open"], { shopId: "shop_1" }, { locationId: "loc_1" }, Date.UTC(2026, 9, 4, 18));
    expect(counts).toEqual({ "invoices-unpaid": 3, "estimates-open": 3, "enquiries-new": 3, "drawers-open": 3 });
    expect(whereOf("invoice.count")).toMatchObject({ shopId: "shop_1", locationId: "loc_1" });
    expect(whereOf("estimate.count")).toEqual({ shopId: "shop_1", status: { in: ["DRAFT", "SENT"] } });
    expect(whereOf("cashDrawerSession.count")).toEqual({ shopId: "shop_1", locationId: "loc_1", closedAt: null });
  });

  it("cuts 'today' on the shop's own calendar (America/Edmonton), whatever zone the server is in", async () => {
    handlers["shop.findUnique"] = () => ({ timezone: "America/Edmonton" });
    // 02:00 UTC on Oct 5 is still Oct 4 in Edmonton (UTC-6).
    await loadHubCounts(["appointments-today"], { shopId: "shop_1" }, {}, Date.UTC(2026, 9, 5, 2));
    const where = whereOf("appointment.count") as { shopId: string; startsAt: { gte: Date; lt: Date } };
    expect(where.shopId).toBe("shop_1");
    expect(where.startsAt.gte.toISOString()).toBe("2026-10-04T06:00:00.000Z");
    expect(where.startsAt.lt.toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });

  it("a count that fails is left off the tile rather than breaking the hub", async () => {
    handlers["vendor.count"] = () => {
      throw new Error("down");
    };
    expect(await loadHubCounts(["suppliers-total", "orders-open"], { shopId: "shop_1" }, {}, 0)).toEqual({ "orders-open": 3 });
  });

  it("says the number with its word", () => {
    expect(hubCountWords("invoices-unpaid", 5)).toBe("5 unpaid");
    expect(hubCountWords("repairs-ready", 2)).toBe("2 ready");
    expect(hubCountWords("customers-total", 1)).toBe("1 customer");
  });
});
