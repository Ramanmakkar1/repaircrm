import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, calls, fakeClient, handlers, resetDb } from "./helpers/db-mock";

/**
 * The Repairs list as a whole page, in both modes, against the recording db
 * fake: what each mode shows, and that every query still carries the session's
 * shopId whatever the URL says.
 */

const state = vi.hoisted(() => ({ simple: true, needsReply: ["t_3"] as string[] }));

vi.mock("@/lib/db", () => ({ db: fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ shopId: "shop_1", userId: "u_1", role: "OWNER", name: "Owner" }) }));
vi.mock("@/lib/location", () => ({ locationWhere: async () => ({}) }));
vi.mock("@/lib/prefs", () => ({ readUiPrefs: async () => ({ simple: state.simple }) }));
vi.mock("@/lib/saved-views-query", () => ({ listSavedViews: async () => [] }));
vi.mock("@/lib/needs-reply", () => ({ needsReplyTicketIds: async () => state.needsReply }));
vi.mock("@/lib/customers/phone-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/customers/phone-search")>()),
  customerMatchClauses: async () => [],
}));
vi.mock("@/app/(app)/tickets/actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(),
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

const { default: TicketsPage } = await import("@/app/(app)/tickets/page");

const DAY = 86_400_000;
const ticket = (id: string, number: number, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  number,
  subject: `Subject ${number}`,
  status,
  priority: "NORMAL",
  problemType: "Screen",
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  customer: { firstName: "Owen", lastName: `Number${number}`, businessName: null },
  assignedTo: null,
  asset: null,
  attachments: [],
  checklist: null,
  depositCents: 0,
  pickedUpAt: null,
  partOrders: [],
  ...extra,
});

beforeEach(() => {
  resetDb();
  state.simple = true;
  state.needsReply = ["t_3"];
  handlers["shop.findUnique"] = () => ({ settings: null });
  handlers["user.findMany"] = () => [{ id: "u_1", name: "Owner" }];
  // The list total, the Overdue tab and the Needs reply tab are three different counts.
  handlers["ticket.count"] = (args) => {
    const where = args.where as Record<string, unknown>;
    if (where.dueDate) return 7;
    if (where.id) return 4;
    return 2;
  };
  handlers["ticket.groupBy"] = () => [
    { status: "New", _count: { _all: 1 } },
    { status: "In Progress", _count: { _all: 1 } },
    { status: "Ready for Pickup", _count: { _all: 1 } },
    { status: "Resolved", _count: { _all: 2 } },
  ];
  handlers["ticket.findMany"] = (args) =>
    "distinct" in args
      ? [{ problemType: "Screen" }]
      : [
          ticket("t_1", 1001, "New", { dueDate: new Date(Date.now() - 2 * DAY), assignedTo: { name: "Marcus Webb" }, asset: { type: "Phone", make: "Apple", model: "iPhone 14" } }),
          ticket("t_3", 1003, "Ready for Pickup"),
        ];
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup((await TicketsPage({ searchParams: Promise.resolve(params) })) as React.ReactElement);

const ticketQueries = () => calls.filter((call) => call.path.startsWith("ticket."));

describe("Repairs list, Easy mode", () => {
  it("shows one New repair button, the day-to-day tabs with counts, one big search, and a card per repair", async () => {
    const html = await render();
    expect(html.match(/New repair/g)).toHaveLength(1);
    for (const label of ["Open jobs", "Ready for pickup", "Needs reply", "Overdue", "All", "In Progress", "Waiting for Parts", "Resolved"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="Search repairs"');
    expect(html).toContain("#1001 · Owen Number1001");
    expect(html).toContain("Overdue 2d");
    expect(html).toContain('href="/tickets/t_1"');
    // No bulk selection and no coloured edge stripe in Easy mode.
    expect(html).not.toContain("Select ticket");
    expect(html).not.toMatch(/border-l-(?:2|status-)/);
  });

  it("counts open as everything but Resolved and points each tab at its own URL", async () => {
    const html = await render();
    const count = (label: string) => html.match(new RegExp(`${label}<span[^>]*>(\\d+)</span>`))?.[1];
    // 1 New + 1 In Progress + 1 Ready + 2 Resolved: 5 in all, 3 of them open.
    expect(count("Open jobs")).toBe("3");
    expect(count("All")).toBe("5");
    expect(count("Ready for pickup")).toBe("1");
    expect(count("Needs reply")).toBe("4");
    expect(count("Overdue")).toBe("7");
    expect(count("Resolved")).toBe("2");
    expect(html).toContain('href="/tickets?status=Ready+for+Pickup"');
    expect(html).toContain('href="/tickets?status=needs-reply"');
    expect(html).toContain('href="/tickets?due=overdue"');
    expect(html).toContain('href="/tickets?status=all"');
  });

  it("lights Overdue, and only Overdue, on ?due=overdue", async () => {
    const html = await render({ due: "overdue" });
    const current = [...html.matchAll(/aria-current="page"[^>]*>([^<]*)/g)].map((match) => match[1]);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain("Overdue");
  });

  it("names the next step on an empty view", async () => {
    handlers["ticket.findMany"] = (args) => ("distinct" in args ? [] : []);
    handlers["ticket.count"] = () => 0;
    handlers["ticket.groupBy"] = () => [];
    const html = await render({ status: "needs-reply" });
    expect(html).toContain("Nobody is waiting on you");
    expect(html).toContain("Show open repairs");
  });

  it("sends a page number past the end to the last page that exists", async () => {
    handlers["ticket.findMany"] = (args) => ("distinct" in args ? [] : []);
    handlers["ticket.count"] = () => 3;
    await expect(render({ page: "9", q: "owen" })).rejects.toThrow("REDIRECT /tickets?q=owen");
  });

  it("filters every ticket query by the session's shop, whatever the URL says", async () => {
    await render({ shopId: "shop_evil", q: "owen", tech: "u_9" });
    const queries = ticketQueries();
    expect(queries.map((query) => query.path)).toEqual(expect.arrayContaining(["ticket.findMany", "ticket.count", "ticket.groupBy"]));
    for (const query of queries) {
      expect((query.args.where as { shopId?: string }).shopId, query.path).toBe("shop_1");
    }
    expect(JSON.stringify(queries)).not.toContain("shop_evil");
  });

  it("measures the tab counts over the search and filters, but not over the view", async () => {
    await render({ status: "Ready for Pickup", q: "owen", tech: "u_9" });
    const where = callsTo("ticket.groupBy")[0].args.where as Record<string, unknown>;
    expect(where.assignedToId).toBe("u_9");
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("id");
  });
});

describe("Repairs list, Full mode", () => {
  beforeEach(() => {
    state.simple = false;
  });

  it("keeps the dense board with its bulk selection and its own words", async () => {
    const html = await render();
    expect(html).toContain('aria-label="Search tickets"');
    expect(html).toContain("Select ticket #1001");
    expect(html).toContain("Needs reply");
    expect(html).not.toContain("Overdue</a>");
  });

  it("does not run the tab-count queries", async () => {
    await render();
    expect(callsTo("ticket.groupBy")).toHaveLength(0);
  });
});
