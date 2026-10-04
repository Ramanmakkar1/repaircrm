import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";

/**
 * The Repairs page on the Ready for pickup view: Easy mode turns it into the
 * pickup counter, Full mode and every other view keep the ordinary list, and
 * the extra query the counter makes is as shop-scoped as the rest.
 */

const state = vi.hoisted(() => ({ simple: true }));

vi.mock("@/lib/db", () => ({ db: fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ shopId: "shop_1", userId: "u_1", role: "OWNER", name: "Owner" }) }));
vi.mock("@/lib/location", () => ({ locationWhere: async () => ({}) }));
vi.mock("@/lib/prefs", () => ({ readUiPrefs: async () => ({ simple: state.simple }) }));
vi.mock("@/lib/saved-views-query", () => ({ listSavedViews: async () => [] }));
vi.mock("@/lib/needs-reply", () => ({ needsReplyTicketIds: async () => [] }));
vi.mock("@/lib/customers/phone-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/customers/phone-search")>()),
  customerMatchClauses: async () => [],
}));
vi.mock("@/app/(app)/tickets/actions", () => ({ markPickedUpAction: vi.fn(), makeInvoiceAction: vi.fn() }));
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
const listRow = (id: string, number: number, status: string, last: string) => ({
  id,
  number,
  subject: `Subject ${number}`,
  status,
  priority: "NORMAL",
  problemType: "Screen",
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(Date.now() - 2 * DAY),
  customer: { firstName: "Owen", lastName: last, businessName: null },
  assignedTo: null,
  asset: { type: "Laptop", make: "Lenovo", model: "ThinkPad T14" },
  attachments: [],
  checklist: null,
  depositCents: 0,
  pickedUpAt: null,
  partOrders: [],
});

const invoice = (paidCents: number) => ({
  id: "inv_9",
  number: 1014,
  status: paidCents >= 17_000 ? "PAID" : "SENT",
  taxRateBps: 0,
  lines: [{ quantity: 1, unitPriceCents: 17_000, taxable: false }],
  payments: paidCents ? [{ amountCents: paidCents }] : [],
  refunds: [],
});

/** The extra query the counter makes is the one that asks for invoices. */
const isDetailsQuery = (args: Record<string, unknown>) => Boolean((args.select as { invoices?: unknown } | undefined)?.invoices);

beforeEach(() => {
  resetDb();
  state.simple = true;
  handlers["shop.findUnique"] = () => ({ settings: null });
  handlers["user.findMany"] = () => [{ id: "u_1", name: "Owner" }];
  handlers["ticket.count"] = () => 2;
  handlers["ticket.groupBy"] = () => [
    { status: "In Progress", _count: { _all: 1 } },
    { status: "Ready for Pickup", _count: { _all: 2 } },
  ];
  handlers["ticket.findMany"] = (args) => {
    if ("distinct" in args) return [{ problemType: "Screen" }];
    if (isDetailsQuery(args)) {
      return [
        {
          id: "t_1",
          customer: { phone: null, mobile: "(512) 555-0145" },
          comments: [{ createdAt: new Date(Date.now() - 2 * DAY) }],
          invoices: [invoice(5_000)],
          _count: { charges: 0 },
        },
        {
          id: "t_2",
          customer: { phone: "(512) 555-0111", mobile: null },
          comments: [],
          invoices: [invoice(17_000)],
          _count: { charges: 0 },
        },
      ];
    }
    return [listRow("t_1", 1015, "Ready for Pickup", "Brooks"), listRow("t_2", 1001, "Ready for Pickup", "Marquez")];
  };
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup((await TicketsPage({ searchParams: Promise.resolve(params) })) as React.ReactElement);

describe("Repairs page, Ready for pickup view, Easy mode", () => {
  it("is the pickup counter: the big header, the tabs, one search, and a card per repair", async () => {
    const html = await render({ status: "Ready for Pickup" });
    expect(html).toContain("Hand the device back and collect payment.");
    expect(html).toContain("2 waiting");
    expect(html).toContain('aria-label="Repair views"');
    expect(html).toContain('aria-label="Search repairs waiting for pickup"');
    expect(html.match(/<article\b/g)).toHaveLength(2);
    expect(html).toContain("#1015 · Owen Brooks");
    expect(html).toContain("#1001 · Owen Marquez");
    // The ordinary list's header and bulk-free toolbar are not drawn twice.
    expect(html).not.toContain("Every job, from check-in to pickup.");
    expect(html).not.toContain("Search repairs\"");
  });

  it("puts the money and the one big button on each card, from the invoices the extra query loaded", async () => {
    const html = await render({ status: "Ready for Pickup" });
    expect(html).toContain("Balance due");
    expect(html).toContain("$120.00");
    expect(html).toContain("$120.00 to collect");
    expect(html).toContain('href="/invoices/inv_9"');
    expect(html).toContain("Paid in full");
    expect(html).toContain('href="tel:5125550145"');
    expect(html).toContain('href="tel:5125550111"');
    expect(html).toContain("Ready since");
  });

  it("makes its one extra query for the page's own repairs, scoped to the session's shop", async () => {
    await render({ status: "Ready for Pickup", shopId: "shop_evil" });
    const detail = callsTo("ticket.findMany").filter((call) => isDetailsQuery(call.args));
    expect(detail).toHaveLength(1);
    const where = detail[0].args.where as { id: { in: string[] }; shopId: string };
    expect(where.shopId).toBe("shop_1");
    expect(where.id.in).toEqual(["t_1", "t_2"]);
    const select = detail[0].args.select as { invoices: { where: Record<string, unknown> }; comments: { where: Record<string, unknown> } };
    // Voided invoices are not a debt, and the ready date is the entry named after the status.
    expect(select.invoices.where).toMatchObject({ shopId: "shop_1", status: { not: "VOID" } });
    expect(select.comments.where).toMatchObject({ shopId: "shop_1", updateType: "Ready for Pickup" });
    expect(JSON.stringify(calls)).not.toContain("shop_evil");
  });

  it("keeps the search and the filters that are set in the form it posts", async () => {
    const html = await render({ status: "Ready for Pickup", q: "owen", tech: "u_9", customerId: "c_1" });
    expect(html).toContain('type="hidden" name="status" value="Ready for Pickup"');
    expect(html).toContain('type="hidden" name="tech" value="u_9"');
    expect(html).toContain('type="hidden" name="customerId" value="c_1"');
    expect(html).toContain('value="owen"');
    expect(html).toContain("2 matches");
  });

  it("says Nothing is waiting for pickup, with a way back to Repairs, and does not ask for details of nothing", async () => {
    handlers["ticket.findMany"] = (args) => ("distinct" in args ? [] : []);
    handlers["ticket.count"] = () => 0;
    const html = await render({ status: "Ready for Pickup" });
    expect(html).toContain("Nothing is waiting for pickup");
    expect(html).toContain("Go to Repairs");
    expect(callsTo("ticket.findMany").filter((call) => isDetailsQuery(call.args))).toHaveLength(0);
  });

  it("sends a page number past the end to the last page that exists, as the list does", async () => {
    handlers["ticket.findMany"] = (args) => ("distinct" in args ? [] : []);
    handlers["ticket.count"] = () => 3;
    await expect(render({ status: "Ready for Pickup", page: "9" })).rejects.toThrow("REDIRECT /tickets?status=Ready+for+Pickup");
  });
});

describe("Repairs page: where the pickup counter does not apply", () => {
  it("keeps the ordinary cards on every other view", async () => {
    for (const params of [{}, { status: "all" }, { status: "In Progress" }] as Record<string, string>[]) {
      const html = await render(params);
      expect(html, JSON.stringify(params)).toContain("Every job, from check-in to pickup.");
      expect(html).not.toContain("Hand the device back and collect payment.");
    }
  });

  it("keeps the ordinary cards under the Overdue lens, which overrides the status in the query", async () => {
    const html = await render({ status: "Ready for Pickup", due: "overdue" });
    expect(html).toContain("Every job, from check-in to pickup.");
    expect(html).not.toContain("Hand the device back and collect payment.");
  });

  it("keeps the dense board in Full mode, even on the Ready for pickup view", async () => {
    state.simple = false;
    const html = await render({ status: "Ready for Pickup" });
    expect(html).toContain('aria-label="Search tickets"');
    expect(html).toContain("Select ticket #1015");
    expect(html).not.toContain("Hand the device back and collect payment.");
    expect(callsTo("ticket.findMany").filter((call) => isDetailsQuery(call.args))).toHaveLength(0);
  });
});
