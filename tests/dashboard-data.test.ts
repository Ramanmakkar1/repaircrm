import { beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, fakeClient, handlers, resetDb, type DbCall } from "./helpers/db-mock";

vi.mock("@/lib/db", () => ({ db: fakeClient }));

const { loadShopOverview } = await import("@/lib/dashboard/overview");
const { loadTodayStrip } = await import("@/lib/dashboard/today");
const { todayWindow } = await import("@/lib/dashboard/money");
const { resolveReportPeriod } = await import("@/components/reports/period");

/**
 * The loader behind /dashboard against the recording db fake: that every query
 * carries the session's shop and the branch on screen, that a technician never
 * triggers a money query, that refunds are subtracted, and that an empty shop
 * still renders. Nothing here reaches a database.
 *
 * "Now" is Saturday 3 October 2026, 15:00 UTC (9:00 in Edmonton, the shop's zone),
 * so "today" is the shop's Saturday: 06:00Z on the 3rd to 06:00Z on the 4th. A
 * shop on UTC has the UTC day, which is Reports' day to the cent.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 15, 0, 0);
const at = (days: number, hours = 0) => new Date(NOW - days * DAY - hours * HOUR);

const OWNER = { shopId: "shop_1", userId: "u_owner", role: "OWNER", name: "Dana Ortiz" };
const FRONT_DESK = { shopId: "shop_1", userId: "u_desk", role: "FRONT_DESK", name: "Priya Shah" };
const TECH = { shopId: "shop_1", userId: "u_tech", role: "TECH", name: "Marcus Webb" };

const customer = { firstName: "Elena", lastName: "Marquez", businessName: null, phone: null, mobile: "512-555-0111" };
const asset = { type: "Phone", make: "Apple", model: "iPhone 14 Pro" };

type World = ReturnType<typeof world>;

/** What the database "holds": a small busy shop. Each test overrides only what it is about. */
function world(over: Record<string, unknown> = {}) {
  return {
    shop: { name: "Demo Repair Shop", timezone: "America/Edmonton", settings: null } as { name: string; timezone: string | null; settings: unknown } | null,
    location: { name: "Downtown" } as { name: string } | null,
    statusGroups: [
      { status: "New", _count: { _all: 2 } },
      { status: "In Progress", _count: { _all: 4 } },
      { status: "Ready for Pickup", _count: { _all: 2 } },
      { status: "Resolved", _count: { _all: 4 } },
    ],
    lateGroups: [
      { status: "New", _count: { _all: 1 } },
      { status: "In Progress", _count: { _all: 4 } },
    ],
    dueToday: 3,
    lateReplyCount: 0,
    openByAssignee: [
      { assignedToId: "u_tech", _count: { _all: 6 } },
      { assignedToId: null, _count: { _all: 2 } },
    ],
    lateByAssignee: [
      { assignedToId: "u_tech", _count: { _all: 4 } },
      { assignedToId: null, _count: { _all: 1 } },
    ],
    users: [
      { id: "u_tech", name: "Marcus Webb", role: "TECH", active: true },
      { id: "u_owner", name: "Dana Ortiz", role: "OWNER", active: true },
    ],
    problemGroups: [
      { problemType: "Screen", _count: { _all: 5 } },
      { problemType: "screen", _count: { _all: 1 } },
      { problemType: "Battery", _count: { _all: 2 } },
    ],
    finished: [
      { createdAt: at(6), resolvedAt: at(4) },
      { createdAt: at(10), resolvedAt: at(6) },
    ],
    replyIds: [] as string[],
    replyTickets: [] as unknown[],
    readyTickets: [] as unknown[],
    readyInvoices: [] as unknown[],
    overdueTickets: [] as unknown[],
    devices: { New: [{ asset }, { asset }], "In Progress": [{ asset }] } as Record<string, unknown[]>,
    lowRows: [] as unknown[],
    lowTotal: 0,
    appointments: [] as unknown[],
    payments: [] as { amountCents: number; method: string; createdAt: Date }[],
    refunds: [] as { amountCents: number; createdAt: Date }[],
    productLines: [] as unknown[],
    productRows: [] as unknown[],
    owedInvoices: [] as unknown[],
    myQueue: [] as unknown[],
    ...over,
  };
}

type Where = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Registers an answer for every query the loader may make; an unregistered one fails by name. */
function install(w: World) {
  handlers["shop.findUnique"] = () => w.shop;
  handlers["location.findFirst"] = () => w.location;
  handlers["ticket.groupBy"] = (args) => {
    const by = (args.by as string[])[0];
    const where = args.where as Where;
    if (by === "status") return where.dueDate ? w.lateGroups : w.statusGroups;
    if (by === "assignedToId") return where.dueDate ? w.lateByAssignee : w.openByAssignee;
    if (by === "problemType") return w.problemGroups;
    throw new Error(`unexpected ticket.groupBy ${by}`);
  };
  // The count of waiting replies that are also late has an id filter; "due today" has none.
  handlers["ticket.count"] = (args) => ((args.where as Where).id ? w.lateReplyCount : w.dueToday);
  handlers["user.findMany"] = () => w.users;
  handlers["ticket.findMany"] = (args) => {
    const where = args.where as Where;
    if (where.resolvedAt) return w.finished;
    if (where.assetId) return w.devices[where.status as string] ?? [];
    if (where.id) return w.replyTickets;
    if (typeof where.assignedToId === "string") return w.myQueue;
    if (where.status === "Ready for Pickup") return w.readyTickets;
    if (where.dueDate) return w.overdueTickets;
    throw new Error(`unexpected ticket.findMany ${JSON.stringify(where)}`);
  };
  handlers["$queryRaw"] = () => w.replyIds.map((id) => ({ id }));
  handlers["invoice.findMany"] = (args) => {
    const where = args.where as Where;
    if (where.ticket) return w.readyInvoices;
    if (where.status?.in) return w.owedInvoices;
    throw new Error(`unexpected invoice.findMany ${JSON.stringify(where)}`);
  };
  handlers["product.findMany"] = (args) => ((args.where as Where).id ? w.productRows : w.lowRows);
  handlers["product.count"] = () => w.lowTotal;
  handlers["appointment.findMany"] = () => w.appointments;
  handlers["payment.findMany"] = () => w.payments;
  handlers["refund.findMany"] = () => w.refunds;
  handlers["invoiceLine.findMany"] = () => w.productLines;
}

const load = (user = OWNER, branch: { locationId?: string } = {}, now = NOW) => loadShopOverview(user, branch, now);

/** The shop an invoice/ticket/product/... query was filtered to, wherever the filter sits. */
function shopOf(call: DbCall): unknown {
  if (call.path === "$queryRaw") return (call.args.values as unknown[])[0];
  const where = (call.args.where ?? {}) as Where;
  if (call.path === "shop.findUnique") return where.id;
  return where.shopId ?? where.invoice?.shopId;
}

beforeEach(() => {
  resetDb();
});

describe("tenant and branch scoping", () => {
  it("filters every query by the session's shop", async () => {
    install(world());
    await load();
    expect(calls.length).toBeGreaterThan(15);
    for (const call of calls) expect(shopOf(call), `${call.path} must carry the shop`).toBe("shop_1");
    expect(JSON.stringify(calls)).not.toMatch(/shop_2/);
  });

  it("narrows tickets, invoices, payments, refunds, appointments and replies to the branch on screen", async () => {
    install(world());
    await load(OWNER, { locationId: "loc_1" });

    for (const path of ["ticket.groupBy", "ticket.count", "ticket.findMany", "appointment.findMany"]) {
      for (const call of callsTo(path)) expect((call.args.where as Where).locationId, `${path} is branch-scoped`).toBe("loc_1");
    }
    // A payment and a refund belong to a branch through their invoice.
    expect((callsTo("payment.findMany")[0].args.where as Where).invoice).toEqual({ locationId: "loc_1" });
    expect((callsTo("refund.findMany")[0].args.where as Where).invoice).toEqual({ locationId: "loc_1" });
    for (const call of callsTo("invoice.findMany")) {
      const where = call.args.where as Where;
      expect(where.ticket ? where.ticket.is.locationId : where.locationId).toBe("loc_1");
    }
    expect((callsTo("invoiceLine.findMany")[0].args.where as Where).invoice.locationId).toBe("loc_1");
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["shop_1", "loc_1"]);
    expect(callsTo("location.findFirst")[0].args.where).toEqual({ id: "loc_1", shopId: "shop_1" });
    // Stock is the shop's, not a branch's.
    for (const call of [...callsTo("product.findMany"), ...callsTo("product.count")]) expect(JSON.stringify(call.args)).not.toContain("loc_1");
  });

  it("does not filter by branch when the whole shop is on screen, and does not look a branch up", async () => {
    install(world());
    const overview = await load(OWNER, {});
    expect(callsTo("location.findFirst")).toHaveLength(0);
    expect(overview.branchName).toBeNull();
    for (const call of calls) expect(JSON.stringify(call.args)).not.toContain("locationId");
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["shop_1"]);
  });

  it("names the branch on screen", async () => {
    install(world());
    expect((await load(OWNER, { locationId: "loc_1" })).branchName).toBe("Downtown");
  });

  it("bounds every list it reads", async () => {
    install(world({ readyTickets: [], owedInvoices: [] }));
    await load();
    for (const path of ["ticket.findMany", "product.findMany", "appointment.findMany", "invoice.findMany", "invoiceLine.findMany"]) {
      for (const call of callsTo(path)) expect(call.args.take, `${path} has a take`).toEqual(expect.any(Number));
    }
    // Payments and refunds are bounded by a date range instead: eight of the shop's days, today last (Edmonton midnight is 06:00Z).
    for (const path of ["payment.findMany", "refund.findMany"]) {
      expect((callsTo(path)[0].args.where as Where).createdAt).toEqual({ gte: new Date(Date.UTC(2026, 8, 26, 6)), lt: new Date(Date.UTC(2026, 9, 4, 6)) });
    }
  });

  it("runs a fixed number of queries however many repairs there are", async () => {
    const ready = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `r${i}`, number: i, updatedAt: at(5), customer, asset, comments: [] }));
    install(world({ readyTickets: ready(2) }));
    await load();
    const few = calls.length;
    const pictureQueries = callsTo("ticket.findMany").filter((call) => (call.args.where as Where).assetId).length;

    resetDb();
    install(
      world({
        statusGroups: [
          { status: "New", _count: { _all: 900 } },
          { status: "In Progress", _count: { _all: 900 } },
          { status: "Ready for Pickup", _count: { _all: 900 } },
        ],
        readyTickets: ready(30),
      }),
    );
    await load();
    // One picture query per status of the pipeline that has repairs, never one per repair.
    expect(pictureQueries).toBe(3);
    expect(calls.length).toBe(few);
  });
});

describe("a technician never gets money", () => {
  it("runs no payment, refund, invoice or product-sales query at all", async () => {
    install(world({ myQueue: [], readyTickets: [{ id: "r1", number: 7, updatedAt: at(5), customer, asset, comments: [] }] }));
    const overview = await load(TECH);

    for (const path of ["payment.findMany", "refund.findMany", "invoice.findMany", "invoiceLine.findMany"]) expect(callsTo(path), path).toHaveLength(0);
    expect(overview.showMoney).toBe(false);
    expect(overview.today).toBeNull();
    expect(overview.owed).toBeNull();
    expect(overview.selling).toBeNull();
    // The Today section is replaced by their own queue.
    expect(overview.myQueue).toMatchObject({ open: 6, late: 4, href: "/tickets?tech=u_tech" });
    expect(JSON.stringify(overview)).not.toMatch(/netCents|totalCents|owedCents|grossCents|balanceCents|takings/i);
  });

  it("reads only their own open repairs for the queue", async () => {
    install(world());
    await load(TECH);
    const mine = callsTo("ticket.findMany").find((call) => (call.args.where as Where).assignedToId === "u_tech");
    expect(mine).toBeDefined();
    expect(mine?.args.where).toMatchObject({ shopId: "shop_1", assignedToId: "u_tech", status: { not: "Resolved" } });
  });

  it("does not run the queue query for anyone else", async () => {
    install(world());
    const overview = await load(OWNER);
    expect(overview.myQueue).toBeNull();
    expect(callsTo("ticket.findMany").some((call) => typeof (call.args.where as Where).assignedToId === "string")).toBe(false);
  });

  it("shows a ready repair without any money row", async () => {
    install(world({ readyTickets: [{ id: "r1", number: 7, updatedAt: at(5), customer, asset, comments: [] }] }));
    const overview = await load(TECH);
    expect(overview.needsYou.rows.map((row) => row.kind)).toEqual(["ready-waiting"]);
    expect(overview.needsYou.rows[0].sentence).not.toMatch(/\$|owes/);
  });

  it("gives front desk the money but not the purchase-order button", async () => {
    install(
      world({
        payments: [{ amountCents: 5000, method: "CASH", createdAt: at(0, 1) }],
        lowRows: [{ id: "p1", name: "Screen", category: "Parts", catalogImage: null, stockQty: 1, lowStockAt: 3, vendorId: "v1", attachments: [] }],
        lowTotal: 1,
      }),
    );
    const overview = await load(FRONT_DESK);
    expect(overview.today?.netCents).toBe(5000);
    expect(overview.canOrder).toBe(false);
    expect(overview.needsYou.rows[0].action).toEqual({ label: "Open", href: "/inventory/p1" });
  });
});

describe("takings: today is the shop's own day", () => {
  const payments = [
    { amountCents: 10_000, method: "CARD", createdAt: new Date(Date.UTC(2026, 9, 3, 9)) },
    { amountCents: 2500, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 12)) },
    { amountCents: 800, method: "CHECK", createdAt: new Date(Date.UTC(2026, 9, 3, 13)) },
    { amountCents: 6000, method: "CARD", createdAt: new Date(Date.UTC(2026, 9, 2, 12)) },
    // Before the window: not read into any day.
    { amountCents: 99_900, method: "CARD", createdAt: new Date(Date.UTC(2026, 8, 25, 12)) },
  ];
  const refunds = [
    { amountCents: 3000, createdAt: new Date(Date.UTC(2026, 9, 3, 14)) },
    { amountCents: 500, createdAt: new Date(Date.UTC(2026, 9, 2, 10)) },
  ];

  it("is collected minus refunded, for the shop's day", async () => {
    install(world({ payments, refunds }));
    const { today } = await load();
    expect(today).not.toBeNull();
    expect(today).toMatchObject({ grossCents: 13_300, refundCents: 3000, netCents: 10_300, cardCents: 10_000, cashCents: 2500, otherCents: 800 });
    // Yesterday took 6000 - 500 = 5500, so today is $48 more.
    expect(today?.comparison).toEqual({ kind: "up", text: "$48 more than yesterday", deltaCents: 4800 });
    expect(today?.days.map((day) => day.key)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(today?.days.map((day) => day.netCents)).toEqual([0, 0, 0, 0, 0, 5500, 10_300]);
    expect(today?.days.map((day) => day.isToday)).toEqual([false, false, false, false, false, false, true]);
    expect(today?.days[6].href).toBe("/reports?period=custom&from=2026-10-03&to=2026-10-03");
    expect(today?.todayHref).toBe("/reports?period=custom&from=2026-10-03&to=2026-10-03");
    expect(today?.weekNetCents).toBe(15_800);
  });

  it("is Reports' own Net revenue to the cent for a shop on UTC", async () => {
    install(world({ payments, refunds, shop: { name: "Demo Repair Shop", timezone: "UTC", settings: null } }));
    const { today } = await load();
    expect(today?.netCents).toBe(10_300);

    // Reports' own definition of Net revenue (components/reports/query.ts): payments collected in the
    // period minus refunds handed back in it, over the period Reports' own maths gives for today.
    const period = resolveReportPeriod({ period: "custom", from: "2026-10-03", to: "2026-10-03" }, new Date(NOW));
    const inPeriod = (date: Date) => date >= period.from && date < period.toExclusive;
    const revenue = payments.filter((row) => inPeriod(row.createdAt)).reduce((sum, row) => sum + row.amountCents, 0);
    const refunded = refunds.filter((row) => inPeriod(row.createdAt)).reduce((sum, row) => sum + row.amountCents, 0);
    expect(today?.netCents).toBe(revenue - refunded);
  });

  it("cuts today at the shop's midnight: Edmonton's Saturday is 06:00Z to 06:00Z, UTC's is 00:00Z to 00:00Z", () => {
    const edmonton = todayWindow(NOW, "America/Edmonton");
    expect(edmonton).toEqual({ key: "2026-10-03", from: Date.UTC(2026, 9, 3, 6), toExclusive: Date.UTC(2026, 9, 4, 6) });

    // For a shop on UTC it is exactly Reports' one-day period.
    const window = todayWindow(NOW, "UTC");
    const period = resolveReportPeriod({ period: "custom", from: window.key, to: window.key }, new Date(NOW));
    expect(window.key).toBe("2026-10-03");
    expect(window.from).toBe(period.from.getTime());
    expect(window.toExclusive).toBe(period.toExclusive.getTime());
  });

  it("keeps a Saturday-evening sale in Saturday's takings, though UTC has turned to Sunday", async () => {
    // 21:10 Saturday in Edmonton is 03:10 Sunday UTC: the moment an owner opens the page at closing time.
    const evening = Date.UTC(2026, 9, 4, 3, 10);
    install(
      world({
        payments: [
          { amountCents: 12_000, method: "CARD", createdAt: new Date(Date.UTC(2026, 9, 3, 15)) }, // 09:00 Saturday
          { amountCents: 4500, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 4, 2, 30)) }, // 20:30 Saturday, already Sunday in UTC
          { amountCents: 700, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 5, 59)) }, // 23:59 Friday
        ],
        refunds: [{ amountCents: 500, createdAt: new Date(Date.UTC(2026, 9, 4, 1)) }],
      }),
    );
    const overview = await load(OWNER, {}, evening);
    expect(overview.dateLabel).toBe("Saturday, October 3");
    expect(overview.today).toMatchObject({ netCents: 16_000, grossCents: 16_500, refundCents: 500, cardCents: 12_000, cashCents: 4500 });
    expect(overview.today?.comparison.text).toBe("$153 more than yesterday");
    expect(overview.today?.todayHref).toBe("/reports?period=custom&from=2026-10-03&to=2026-10-03");
    // The last bar is Saturday, today, and the day before it is Friday: there is no "Sunday, Oct 4".
    expect(overview.today?.days.slice(-2).map((day) => [day.label, day.isToday, day.netCents])).toEqual([
      ["Friday, Oct 2", false, 700],
      ["Saturday, Oct 3", true, 16_000],
    ]);
    // And the queries were bounded by the shop's days, not by UTC's.
    expect((callsTo("payment.findMany")[0].args.where as Where).createdAt).toEqual({ gte: new Date(Date.UTC(2026, 8, 26, 6)), lt: new Date(Date.UTC(2026, 9, 4, 6)) });
  });

  it("reads the shop's time zone before it cuts any day", async () => {
    install(world());
    await load();
    expect(calls[0].path).toBe("shop.findUnique");
    // Home's strip needs it first too.
    resetDb();
    install(world());
    await loadTodayStrip(OWNER, {}, NOW);
    expect(calls[0].path).toBe("shop.findUnique");
  });

  it("falls back to UTC days when the shop's zone is missing or wrong", async () => {
    for (const zone of [null, "Not/AZone"]) {
      resetDb();
      install(world({ shop: { name: "S", timezone: zone, settings: null }, payments: [{ amountCents: 900, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 1)) }] }));
      expect((await load()).today?.netCents).toBe(900);
    }
  });

  it("is zero, and says so in words, when nothing was taken", async () => {
    install(world());
    const { today } = await load();
    expect(today).toMatchObject({ netCents: 0, grossCents: 0, refundCents: 0 });
    expect(today?.comparison.text).toBe("Nothing taken yet today");
    expect(today?.days).toHaveLength(7);
    expect(today?.days.every((day) => day.netCents === 0)).toBe(true);
  });

  it("goes negative, in words, when more went back than came in", async () => {
    install(world({ refunds: [{ amountCents: 1500, createdAt: new Date(Date.UTC(2026, 9, 3, 10)) }] }));
    const { today } = await load();
    expect(today?.netCents).toBe(-1500);
    expect(today?.comparison.text).toBe("More refunded than taken today");
  });

  it("counts a payment at the first instant of the day and not at the first instant of tomorrow", async () => {
    install(
      world({
        payments: [
          { amountCents: 100, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 6, 0, 0, 0)) },
          { amountCents: 900, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 4, 6, 0, 0, 0)) },
          { amountCents: 700, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 5, 59, 59, 999)) },
        ],
      }),
    );
    const { today } = await load();
    expect(today?.netCents).toBe(100);
    expect(today?.days[5].netCents).toBe(700);
  });
});

describe("owed to you: the invoices list's figure", () => {
  const invoice = (over: Record<string, unknown>) => ({
    id: "inv_1",
    number: 1001,
    dueDate: null,
    taxRateBps: 0,
    customer: { id: "c1", firstName: "Elena", lastName: "Marquez", businessName: null, phone: "512-555-0111", mobile: null },
    lines: [{ quantity: 1, unitPriceCents: 10_000, taxable: false }],
    payments: [] as { amountCents: number }[],
    refunds: [] as { amountCents: number; status: string }[],
    ...over,
  });

  it("reads sent and part-paid invoices of this shop and branch, and totals refund-aware balances", async () => {
    install(
      world({
        owedInvoices: [
          invoice({ id: "a", number: 1014, dueDate: new Date(Date.UTC(2026, 9, 1)), lines: [{ quantity: 1, unitPriceCents: 45_000, taxable: false }], customer: { id: "c2", firstName: "", lastName: "", businessName: "Okonkwo Dental Group", phone: null, mobile: "780-555-0100" } }),
          // Paid in full, then refunded in full: the balance is back.
          invoice({ id: "b", number: 1012, payments: [{ amountCents: 10_000 }], refunds: [{ amountCents: 10_000, status: "completed" }] }),
          // Settled.
          invoice({ id: "c", number: 1010, payments: [{ amountCents: 10_000 }] }),
        ],
      }),
    );
    const { owed } = await load(OWNER, { locationId: "loc_1" });

    const query = callsTo("invoice.findMany").find((call) => (call.args.where as Where).status?.in);
    expect(query?.args.where).toEqual({ shopId: "shop_1", status: { in: ["SENT", "PARTIAL"] }, locationId: "loc_1" });
    expect(owed).toMatchObject({ totalCents: 55_000, count: 2, overdueCount: 1, truncated: false });
    expect(owed?.customers.map((c) => [c.name, c.cents])).toEqual([
      ["Okonkwo Dental Group", 45_000],
      ["Elena Marquez", 10_000],
    ]);
    expect(owed?.customers[0].callHref).toMatch(/^tel:/);
    expect(owed?.lateInvoices[0]).toMatchObject({ id: "a", number: 1014, daysLate: 2, balanceCents: 45_000 });
  });

  it("is zero with nothing unpaid", async () => {
    install(world());
    expect((await load()).owed).toEqual({ totalCents: 0, count: 0, overdueCount: 0, customers: [], lateInvoices: [], truncated: false });
  });

  it("says when more invoices exist than were read", async () => {
    install(world({ owedInvoices: Array.from({ length: 2000 }, (_, i) => invoice({ id: `i${i}`, number: i, customer: { id: `c${i}`, firstName: "A", lastName: "B", businessName: null, phone: null, mobile: null } })) }));
    const { owed } = await load();
    expect(owed?.truncated).toBe(true);
    expect(owed?.count).toBe(2000);
  });
});

describe("the repair pipeline", () => {
  it("has one tile per status of the shop's pipeline, in order, with Resolved left out", async () => {
    install(world());
    const { bench } = await load();
    expect(bench.tiles.map((tile) => [tile.status, tile.count, tile.overdue])).toEqual([
      ["New", 2, 1],
      ["In Progress", 4, 4],
      ["Waiting for Parts", 0, 0],
      ["Waiting on Customer", 0, 0],
      ["Ready for Pickup", 2, 0],
    ]);
    expect(bench).toMatchObject({ open: 8, late: 5, dueToday: 3, sentence: "8 open repairs. 5 are late." });
    expect(bench.tiles[0].href).toBe("/tickets?status=New");
  });

  it("follows a shop that renamed its statuses and keeps a status found on a repair", async () => {
    install(
      world({
        shop: { name: "S", timezone: null, settings: { ticketStatuses: ["Intake", "Bench", "Resolved"] } },
        statusGroups: [
          { status: "Intake", _count: { _all: 1 } },
          { status: "Legacy", _count: { _all: 2 } },
        ],
        lateGroups: [],
      }),
    );
    const { bench } = await load();
    expect(bench.tiles.map((tile) => tile.status)).toEqual(["Intake", "Bench", "Legacy"]);
    expect(bench.open).toBe(3);
  });

  it("asks for the oldest repairs with a device on each status that has any, three at most", async () => {
    install(world());
    const { bench } = await load();
    const pictureQueries = callsTo("ticket.findMany").filter((call) => (call.args.where as Where).assetId);
    expect(pictureQueries.map((call) => (call.args.where as Where).status).sort()).toEqual(["In Progress", "New", "Ready for Pickup"]);
    for (const call of pictureQueries) {
      expect(call.args).toMatchObject({ take: 3, orderBy: { createdAt: "asc" } });
      expect(call.args.where).toMatchObject({ shopId: "shop_1", assetId: { not: null } });
    }
    expect(bench.tiles[0].devices).toEqual([
      { type: "Phone", make: "Apple", model: "iPhone 14 Pro" },
      { type: "Phone", make: "Apple", model: "iPhone 14 Pro" },
    ]);
    expect(bench.tiles[1].devices).toHaveLength(1);
    // A status with repairs but no device on any of them has no pictures to show.
    expect(bench.tiles[4].devices).toEqual([]);
  });

  it("counts late and due-today exactly as the Repairs list does", async () => {
    install(world());
    await load();
    const late = callsTo("ticket.groupBy").find((call) => (call.args.by as string[])[0] === "status" && (call.args.where as Where).dueDate);
    expect(late?.args.where).toEqual({ shopId: "shop_1", status: { not: "Resolved" }, dueDate: { lt: new Date(NOW) } });
    const dueToday = callsTo("ticket.count")[0].args.where as Where;
    expect(dueToday.status).toEqual({ not: "Resolved" });
    expect(dueToday.dueDate.gte).toEqual(new Date(NOW));
    expect(dueToday.dueDate.lte.getTime()).toBeGreaterThan(NOW);
  });

  it("states the average time to finish from repairs resolved in the last 30 days, and leaves it out with none", async () => {
    install(world());
    const withData = await load();
    // 2 days and 4 days: three days on average.
    expect(withData.bench.finish).toEqual({ words: "3 days", count: 2 });
    const query = callsTo("ticket.findMany").find((call) => (call.args.where as Where).resolvedAt);
    // 30 of the shop's days ending today: from Edmonton midnight on 4 September to Edmonton midnight on 4 October.
    expect((query?.args.where as Where).resolvedAt).toEqual({ gte: new Date(Date.UTC(2026, 8, 4, 6)), lt: new Date(Date.UTC(2026, 9, 4, 6)) });

    resetDb();
    install(world({ finished: [] }));
    expect((await load()).bench.finish).toBeNull();
  });
});

describe("needs you now", () => {
  it("collects late repairs, a ready repair that is unpaid, a waiting reply, a late invoice and low stock, ranked", async () => {
    install(
      world({
        overdueTickets: [{ id: "t_late", number: 1011, dueDate: at(3), priority: "NORMAL", customer, asset }],
        readyTickets: [{ id: "t_ready", number: 1015, updatedAt: at(10), customer, asset, comments: [{ createdAt: at(2) }] }],
        readyInvoices: [
          { id: "inv_ready", number: 1015, status: "SENT", ticketId: "t_ready", taxRateBps: 0, lines: [{ quantity: 1, unitPriceCents: 5000, taxable: false }], payments: [], refunds: [] },
        ],
        replyIds: ["t_reply"],
        replyTickets: [{ id: "t_reply", number: 1020, lastInboundAt: at(0, 3), customer, asset: { type: "Laptop", make: "HP", model: "Envy" } }],
        owedInvoices: [
          {
            id: "inv_late",
            number: 1014,
            dueDate: new Date(Date.UTC(2026, 9, 1)),
            taxRateBps: 0,
            customer: { id: "c9", firstName: "", lastName: "", businessName: "Okonkwo Dental Group", phone: null, mobile: null },
            lines: [{ quantity: 1, unitPriceCents: 45_000, taxable: false }],
            payments: [],
            refunds: [],
          },
        ],
        lowRows: [{ id: "p1", name: "MacBook Keyboard", category: "Parts", catalogImage: null, stockQty: 2, lowStockAt: 2, vendorId: null, attachments: [{ id: "att_1" }] }],
        lowTotal: 1,
      }),
    );
    const { needsYou, stockWatch } = await load();
    expect(needsYou.rows.map((row) => [row.kind, row.action.label, row.action.href])).toEqual([
      ["overdue-repair", "Open", "/tickets/t_late"],
      ["ready-unpaid", "Take payment", "/invoices/inv_ready"],
      ["invoice-late", "Take payment", "/invoices/inv_late"],
      ["reply", "Reply", "/tickets/t_reply"],
      ["low-stock", "Order more", "/inventory/purchase-orders/new"],
    ]);
    expect(needsYou.rows[1].sentence).toBe("Elena Marquez can collect their Apple iPhone 14 Pro, but still owes $50.");
    // The stock row carries the product's own photo when it has one.
    expect(needsYou.rows[4].visual).toMatchObject({ kind: "product", imageUrl: "/files/att_1" });
    expect(stockWatch).toMatchObject({ total: 1 });
    expect(stockWatch.items[0]).toMatchObject({ id: "p1", stockQty: 2, lowStockAt: 2 });
  });

  describe("the count of what is left off the list", () => {
    /** A busy day: nine late repairs (only the oldest six are read), a late invoice, two ready repairs, one low product, one customer waiting. */
    const busy = (over: Record<string, unknown> = {}) =>
      world({
        statusGroups: [
          { status: "New", _count: { _all: 2 } },
          { status: "In Progress", _count: { _all: 4 } },
          { status: "Waiting for Parts", _count: { _all: 2 } },
          { status: "Waiting on Customer", _count: { _all: 2 } },
          { status: "Ready for Pickup", _count: { _all: 2 } },
        ],
        lateGroups: [
          { status: "New", _count: { _all: 1 } },
          { status: "In Progress", _count: { _all: 4 } },
          { status: "Waiting for Parts", _count: { _all: 2 } },
          { status: "Waiting on Customer", _count: { _all: 2 } },
        ],
        overdueTickets: Array.from({ length: 6 }, (_, index) => ({ id: `t_o${index + 1}`, number: 1000 + index, dueDate: at(9 - index), priority: "NORMAL", customer, asset })),
        readyTickets: [
          { id: "t_r1", number: 1101, updatedAt: at(10), customer, asset, dueDate: null, comments: [] },
          { id: "t_r2", number: 1102, updatedAt: at(5), customer, asset, dueDate: null, comments: [] },
        ],
        owedInvoices: [
          {
            id: "inv_late",
            number: 1014,
            dueDate: new Date(Date.UTC(2026, 9, 1)),
            taxRateBps: 0,
            customer: { id: "c9", firstName: "", lastName: "", businessName: "Okonkwo Dental Group", phone: null, mobile: null },
            lines: [{ quantity: 1, unitPriceCents: 45_000, taxable: false }],
            payments: [],
            refunds: [],
          },
        ],
        lowRows: [{ id: "p1", name: "MacBook Keyboard", category: "Parts", catalogImage: null, stockQty: 2, lowStockAt: 2, vendorId: null, attachments: [] }],
        lowTotal: 1,
        // The one waiting customer is on a repair that is also late (the ninth, which is not among the six read).
        replyIds: ["t_o9"],
        replyTickets: [{ id: "t_o9", number: 1004, lastInboundAt: at(0, 3), customer, asset }],
        lateReplyCount: 1,
        ...over,
      });

    it("counts all nine late repairs, not the six that were read: 13 things, 6 shown, 7 left", async () => {
      install(busy());
      const { needsYou, bench } = await load();
      expect(needsYou.rows).toHaveLength(6);
      // 9 late repairs + 1 late invoice + 2 ready + 1 low product; the waiting customer is one of the late repairs.
      expect(needsYou.candidates).toBe(13);
      expect(needsYou.candidates - needsYou.rows.length).toBe(7);
      expect(bench.late).toBe(9);
    });

    it("grows with the backlog: forty late repairs are forty things", async () => {
      install(busy({ lateGroups: [{ status: "In Progress", _count: { _all: 40 } }], statusGroups: [{ status: "In Progress", _count: { _all: 40 } }], replyIds: [], replyTickets: [], lateReplyCount: 0, readyTickets: [], owedInvoices: [], lowRows: [], lowTotal: 0 }));
      const { needsYou } = await load();
      expect(needsYou.rows).toHaveLength(3);
      expect(needsYou.candidates).toBe(40);
    });

    it("counts a waiting customer whose repair is not late as a thing of its own", async () => {
      install(busy({ replyIds: ["t_fresh"], replyTickets: [{ id: "t_fresh", number: 1200, lastInboundAt: at(0, 3), customer, asset }], lateReplyCount: 0 }));
      expect((await load()).needsYou.candidates).toBe(14);
    });

    it("counts a ready repair that is also late once", async () => {
      // t_r1 is ready and past its due date, so it is among the nine late repairs already.
      install(
        busy({
          readyTickets: [
            { id: "t_r1", number: 1101, updatedAt: at(10), customer, asset, dueDate: at(2), comments: [] },
            { id: "t_r2", number: 1102, updatedAt: at(5), customer, asset, dueDate: null, comments: [] },
          ],
        }),
      );
      expect((await load()).needsYou.candidates).toBe(12);
    });

    it("counts no invoice for someone who may not see money, and still counts the rest", async () => {
      install(busy());
      expect((await load(TECH)).needsYou.candidates).toBe(12);
    });

    it("asks how many waiting replies are late with this shop and branch on the question", async () => {
      install(busy());
      await load(OWNER, { locationId: "loc_1" });
      const query = callsTo("ticket.count").find((call) => (call.args.where as Where).id);
      expect(query?.args.where).toEqual({ shopId: "shop_1", locationId: "loc_1", status: { not: "Resolved" }, dueDate: { lt: new Date(NOW) }, id: { in: ["t_o9"] } });
    });

    it("does not ask when nobody is waiting", async () => {
      install(busy({ replyIds: [], replyTickets: [], lateReplyCount: 0 }));
      await load();
      expect(callsTo("ticket.count").some((call) => (call.args.where as Where).id)).toBe(false);
    });
  });

  describe("customers waiting for a reply", () => {
    it("have a way in: the Needs reply count is the number of waiting repairs", async () => {
      install(world({ replyIds: ["t_a", "t_b"], replyTickets: [] }));
      expect((await load()).bench.needsReply).toBe(2);
      resetDb();
      install(world());
      expect((await load()).bench.needsReply).toBe(0);
    });

    it("are still on the list when their repair is late but its overdue row did not fit", async () => {
      // Three overdue rows fill that kind's quota; the fourth late repair is also waiting for a reply, so it is shown as a reply.
      install(
        world({
          overdueTickets: Array.from({ length: 4 }, (_, index) => ({ id: `t_o${index + 1}`, number: 1000 + index, dueDate: at(9 - index * 2), priority: "NORMAL", customer, asset })),
          replyIds: ["t_o4"],
          replyTickets: [{ id: "t_o4", number: 1004, lastInboundAt: at(0, 3), customer, asset: { type: "Laptop", make: "Dell", model: "Latitude 5420" } }],
          lateReplyCount: 1,
        }),
      );
      const { needsYou } = await load();
      expect(needsYou.rows.map((row) => row.key)).toEqual(["overdue:t_o1", "overdue:t_o2", "overdue:t_o3", "reply:t_o4"]);
      expect(needsYou.rows[3].sentence).toBe("Elena Marquez is waiting for a reply about Dell Latitude 5420.");
    });
  });

  it("uses the Stock list's low-stock rule: active products at or below their reorder point", async () => {
    install(world());
    await load();
    for (const call of [...callsTo("product.findMany"), ...callsTo("product.count")]) {
      const where = call.args.where as Where;
      if (where.id) continue;
      expect(where).toMatchObject({ shopId: "shop_1", active: true });
      expect(Object.keys(where.lowStockAt)).toEqual(["gte"]);
    }
  });

  it("asks for the reply tickets of this shop only, newest first, three at most", async () => {
    install(world({ replyIds: ["t_a", "t_b"], replyTickets: [] }));
    await load();
    const query = callsTo("ticket.findMany").find((call) => (call.args.where as Where).id);
    expect(query?.args).toMatchObject({ take: 3, orderBy: { lastInboundAt: "desc" }, where: { shopId: "shop_1", id: { in: ["t_a", "t_b"] } } });
  });

  it("does not look for reply tickets when nobody is waiting", async () => {
    install(world({ replyIds: [] }));
    await load();
    expect(callsTo("ticket.findMany").some((call) => (call.args.where as Where).id)).toBe(false);
  });
});

describe("team and demand", () => {
  it("counts open and late repairs per person, the unassigned row first", async () => {
    install(world());
    const { workload } = await load();
    expect(workload.rows.map((row) => row.words)).toEqual(["Not assigned: 2 open, 1 late", "Marcus Webb: 6 open, 4 late"]);
    expect(workload.rows[1].href).toBe("/tickets?tech=u_tech");
  });

  it("merges the popular problem types of the last 30 days", async () => {
    install(world());
    const { popular } = await load();
    expect(popular).toEqual([
      { label: "Screen", count: 6 },
      { label: "Battery", count: 2 },
    ]);
    const query = callsTo("ticket.groupBy").find((call) => (call.args.by as string[])[0] === "problemType");
    expect((query?.args.where as Where).createdAt).toEqual({ gte: new Date(Date.UTC(2026, 8, 4, 6)), lt: new Date(Date.UTC(2026, 9, 4, 6)) });
  });

  it("ranks products by revenue over the last seven days and joins their pictures", async () => {
    install(
      world({
        productLines: [
          { productId: "p1", quantity: 1, unitPriceCents: 18_900, product: { name: "iPhone 14 Screen Assembly" } },
          { productId: "p2", quantity: 3, unitPriceCents: 1000, product: { name: "Case" } },
          { productId: "p2", quantity: 1, unitPriceCents: 1000, product: { name: "Case" } },
        ],
        productRows: [{ id: "p1", category: "Parts", catalogImage: "/images/catalog/iphone-screen.webp", attachments: [{ id: "att_9" }] }],
      }),
    );
    const { selling } = await load();
    expect(selling?.rows).toEqual([
      { productId: "p1", name: "iPhone 14 Screen Assembly", units: 1, cents: 18_900, category: "Parts", catalogImage: "/images/catalog/iphone-screen.webp", imageUrl: "/files/att_9" },
      { productId: "p2", name: "Case", units: 4, cents: 4000, category: null, catalogImage: null, imageUrl: null },
    ]);
    expect(selling?.href).toBe("/reports?period=custom&from=2026-09-27&to=2026-10-03");
    const lines = (callsTo("invoiceLine.findMany")[0].args.where as Where);
    expect(lines.invoice).toMatchObject({ shopId: "shop_1", status: { not: "VOID" }, createdAt: { gte: new Date(Date.UTC(2026, 8, 27, 6)), lt: new Date(Date.UTC(2026, 9, 4, 6)) } });
    // The picture lookup is for this shop's products only.
    const products = callsTo("product.findMany").find((call) => (call.args.where as Where).id);
    expect(products?.args.where).toEqual({ shopId: "shop_1", id: { in: ["p1", "p2"] } });
  });

  it("lists the next visits with the day in the shop's own words", async () => {
    install(
      world({
        appointments: [
          { id: "ap1", title: "Data handover", startsAt: new Date(NOW + DAY), customer: { firstName: "Amara", lastName: "Nwosu", businessName: null } },
          { id: "ap2", title: "Walk-in", startsAt: new Date(NOW + 4 * DAY), customer: null },
        ],
      }),
    );
    const { appointments } = await load();
    expect(appointments[0]).toMatchObject({ title: "Data handover", customerName: "Amara Nwosu", day: "Tomorrow", href: "/appointments?date=2026-10-04" });
    expect(appointments[1]).toMatchObject({ customerName: null, day: "Wed, Oct 7" });
    const query = callsTo("appointment.findMany")[0].args;
    expect(query.where).toMatchObject({ shopId: "shop_1", status: "SCHEDULED" });
  });
});

describe("the header", () => {
  it("greets by the hour in the shop's zone and prints the shop's date", async () => {
    install(world());
    const overview = await load();
    // 15:00 UTC is 9:00 in Edmonton.
    expect(overview).toMatchObject({ greeting: "Good morning", firstName: "Dana", shopName: "Demo Repair Shop", dateLabel: "Saturday, October 3", timezone: "America/Edmonton" });
  });

  it("falls back to UTC and a generic name when the shop row is odd or missing", async () => {
    install(world({ shop: { name: "S", timezone: "Not/AZone", settings: null } }));
    expect((await load()).greeting).toBe("Good afternoon");
    resetDb();
    install(world({ shop: null }));
    expect((await load()).shopName).toBe("Your shop");
  });
});

describe("an empty shop", () => {
  it("renders with zeros, words and no rows, and does not throw", async () => {
    install(
      world({
        statusGroups: [],
        lateGroups: [],
        dueToday: 0,
        openByAssignee: [],
        lateByAssignee: [],
        users: [],
        problemGroups: [],
        finished: [],
        devices: {},
      }),
    );
    const overview = await load();
    expect(overview.bench.open).toBe(0);
    expect(overview.bench.sentence).toBe("Nothing is on the bench.");
    // The pipeline still shows the shop's statuses, every one at zero.
    expect(overview.bench.tiles.map((tile) => tile.status)).toEqual(["New", "In Progress", "Waiting for Parts", "Waiting on Customer", "Ready for Pickup"]);
    expect(overview.bench.tiles.every((tile) => tile.count === 0 && tile.overdue === 0 && tile.devices.length === 0)).toBe(true);
    expect(overview.bench.finish).toBeNull();
    expect(overview.needsYou).toEqual({ rows: [], candidates: 0 });
    expect(overview.today?.netCents).toBe(0);
    expect(overview.today?.comparison.kind).toBe("none");
    expect(overview.owed?.count).toBe(0);
    expect(overview.workload).toEqual({ rows: [], hidden: 0 });
    expect(overview.selling?.rows).toEqual([]);
    expect(overview.popular).toEqual([]);
    expect(overview.appointments).toEqual([]);
    expect(overview.stockWatch).toEqual({ total: 0, items: [] });
    // And it is plain JSON: nothing for the page to choke on when it crosses to the client.
    expect(JSON.parse(JSON.stringify(overview))).toEqual(overview);
  });

  it("only queries the pictures, replies and products it needs", async () => {
    install(world({ statusGroups: [], lateGroups: [], devices: {}, productLines: [] }));
    await load();
    expect(callsTo("ticket.findMany").some((call) => (call.args.where as Where).assetId)).toBe(false);
    expect(callsTo("product.findMany").some((call) => (call.args.where as Where).id)).toBe(false);
  });
});

describe("the Home strip", () => {
  it("gives a technician nothing and runs no query", async () => {
    install(world());
    expect(await loadTodayStrip(TECH, {}, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("gives the same takings and owed figures as the overview, and the ready count", async () => {
    const data = world({
      payments: [
        { amountCents: 10_000, method: "CARD", createdAt: new Date(Date.UTC(2026, 9, 3, 9)) },
        { amountCents: 2500, method: "CASH", createdAt: new Date(Date.UTC(2026, 9, 3, 12)) },
      ],
      refunds: [{ amountCents: 3000, createdAt: new Date(Date.UTC(2026, 9, 3, 14)) }],
      owedInvoices: [
        {
          id: "a",
          number: 1,
          dueDate: null,
          taxRateBps: 0,
          customer: { id: "c1", firstName: "A", lastName: "B", businessName: null, phone: null, mobile: null },
          lines: [{ quantity: 1, unitPriceCents: 45_000, taxable: false }],
          payments: [{ amountCents: 5000 }],
          refunds: [],
        },
      ],
      dueToday: 2,
    });
    install(data);
    const strip = await loadTodayStrip(OWNER, { locationId: "loc_1" }, NOW);
    expect(strip).toEqual({ todayKey: "2026-10-03", takingsCents: 9500, owedCents: 40_000, owedTruncated: false, readyCount: 2 });

    for (const call of calls) expect(shopOf(call)).toBe("shop_1");
    const ready = callsTo("ticket.count")[0].args.where;
    expect(ready).toEqual({ shopId: "shop_1", locationId: "loc_1", status: "Ready for Pickup" });
    expect((callsTo("payment.findMany")[0].args.where as Where).invoice).toEqual({ locationId: "loc_1" });

    resetDb();
    install(data);
    const overview = await load(OWNER, { locationId: "loc_1" });
    expect(overview.today?.netCents).toBe(strip?.takingsCents);
    expect(overview.owed?.totalCents).toBe(strip?.owedCents);
  });

  it("gives front desk the strip too", async () => {
    install(world());
    expect(await loadTodayStrip(FRONT_DESK, {}, NOW)).toMatchObject({ takingsCents: 0, owedCents: 0 });
  });
});
