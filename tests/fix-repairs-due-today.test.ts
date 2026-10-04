import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, fakeClient, handlers, resetDb } from "./helpers/db-mock";

/**
 * The Repairs list's "Due today" lens and the inline due-date field, against
 * the recording db fake, with the clock stopped at 7:30 PM on Sunday Oct 4 in
 * Edmonton (01:30 UTC on Monday Oct 5): the hour the server's own calendar is
 * already on tomorrow.
 */

vi.mock("@/lib/db", () => ({ db: fakeClient, prisma: fakeClient, default: fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ shopId: "shop_1", userId: "u_1", role: "OWNER", name: "Owner" }) }));
vi.mock("@/lib/location", () => ({ locationWhere: async () => ({}) }));
vi.mock("@/lib/prefs", () => ({ readUiPrefs: async () => ({ simple: true }) }));
vi.mock("@/lib/saved-views-query", () => ({ listSavedViews: async () => [] }));
vi.mock("@/lib/needs-reply", () => ({ needsReplyTicketIds: async () => [] }));
vi.mock("@/lib/customers/phone-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/customers/phone-search")>()),
  customerMatchClauses: async () => [],
}));
vi.mock("@/app/(app)/tickets/actions", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(),
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

const { default: TicketsPage } = await import("@/app/(app)/tickets/page");
const { setTicketFieldAction } = await import("@/app/(app)/tickets/field-actions");

const EVENING = Date.UTC(2026, 9, 5, 1, 30);
const SHOP_MIDNIGHT = Date.UTC(2026, 9, 5, 6, 0); // the end of Oct 4 in Edmonton

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EVENING);
  resetDb();
  handlers["shop.findUnique"] = (args) => {
    const where = args.where as { id?: string };
    return where.id === "shop_1" ? { settings: null, timezone: "America/Edmonton" } : null;
  };
  handlers["user.findMany"] = () => [];
  handlers["ticket.count"] = () => 1;
  handlers["ticket.groupBy"] = () => [{ status: "New", _count: { _all: 1 } }];
  handlers["ticket.findMany"] = (args) =>
    "distinct" in args
      ? []
      : [
          {
            id: "t_1",
            number: 1001,
            subject: "Cracked screen",
            status: "New",
            priority: "NORMAL",
            problemType: "Screen",
            // Thursday Oct 8, 9 PM in Edmonton: Friday in UTC.
            dueDate: new Date(Date.UTC(2026, 9, 9, 3, 0)),
            createdAt: new Date(EVENING),
            updatedAt: new Date(EVENING),
            customer: { firstName: "Owen", lastName: "Fitzgerald", businessName: null },
            assignedTo: null,
            asset: null,
            attachments: [],
            checklist: null,
            depositCents: 0,
            pickedUpAt: null,
            partOrders: [],
          },
        ];
  handlers["ticket.updateMany"] = (args) => ({ count: (args.where as { shopId?: string }).shopId === "shop_1" ? 1 : 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

const render = async (params: Record<string, string>) =>
  renderToStaticMarkup((await TicketsPage({ searchParams: Promise.resolve(params) })) as React.ReactElement);

describe("Repairs > Due today", () => {
  it("runs from now to midnight in the shop's zone, not the server's", async () => {
    await render({ due: "today" });
    const list = callsTo("ticket.findMany").find((call) => !("distinct" in call.args));
    const where = list?.args.where as { dueDate?: { gte: Date; lt: Date }; status?: unknown; shopId?: string };
    expect(where.shopId).toBe("shop_1");
    expect(where.dueDate).toEqual({ gte: new Date(EVENING), lt: new Date(SHOP_MIDNIGHT) });
    expect(where.status).toEqual({ not: "Resolved" });
  });

  it("reads the shop's zone from this shop's row only", async () => {
    await render({});
    expect(callsTo("shop.findUnique").map((call) => call.args)).toEqual([
      { where: { id: "shop_1" }, select: { settings: true, timezone: true } },
    ]);
  });

  it("dates a repair due later on the shop's calendar", async () => {
    const out = await render({});
    expect(out).toContain("Due Oct 8");
    expect(out).not.toContain("Due Oct 9");
  });
});

describe("the inline due date", () => {
  it("stores a typed day as midnight in the shop's zone", async () => {
    const result = await setTicketFieldAction("t_1", "dueDate", "2026-10-08");
    expect(result.ok).toBe(true);
    expect(callsTo("shop.findUnique")[0].args).toEqual({ where: { id: "shop_1" }, select: { timezone: true } });
    expect((dataOf("ticket.updateMany").dueDate as Date).toISOString()).toBe("2026-10-08T06:00:00.000Z");
  });
});
