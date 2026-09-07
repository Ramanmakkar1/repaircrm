import { beforeEach, describe, expect, it, vi } from "vitest";

import { BULK_LIMIT, BULK_SEND_LIMIT, bulkIds } from "@/lib/bulk";

import {
  calls,
  callsTo,
  fakeClient,
  handlers,
  resetDb,
  whereOf,
} from "./helpers/db-mock";

/**
 * BULK ACTIONS — one request, a hundred rows.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/tenancy.test.ts
 * ---------------------------------------------------------------------------
 * Every argument in that file applies here twice over. A single-record action
 * that forgets its `shopId` leaks one row to whoever guessed one id; a bulk
 * action that forgets it rewrites as many of another tenant's records as the
 * caller cares to name — and `updateMany({ where: { id: { in: ids } } })` is a
 * plausible-looking line of code that does exactly that.
 *
 * Two failure modes are unique to bulk and are pinned below:
 *
 *   · AN EMPTY LIST MUST WRITE NOTHING. `where: { id: { in: [] }, shopId }` is
 *     harmless, but the shapes near it are not, and this codebase has already
 *     shipped a `deleteMany` with a possibly-undefined id. So the assertion is
 *     not "the query was safe" — it is "no query was issued at all".
 *   · A LIST MUST BE BOUNDED. Over the cap, nothing is read and nothing is
 *     written.
 *
 * ---------------------------------------------------------------------------
 * HOW
 * ---------------------------------------------------------------------------
 * The recording fake from tests/helpers/db-mock.ts, so the tenant filter is
 * asserted on the ARGUMENTS the action passed Prisma. That is the only honest
 * way to test it: a real query with a missing `shopId` still returns rows and
 * still passes.
 *
 * `requireUser` is stubbed with a MUTABLE shop id. Pointing the session at a
 * different tenant and watching every `where` follow it is what proves the
 * actions read `shopId` from the session rather than from anything the client
 * sent — none of them even accepts a shopId parameter, and this is how that
 * stays true.
 */

const SHOP = "shop_1";
const OTHER = "shop_2";

const session = vi.hoisted(() => ({
  shopId: "shop_1",
  userId: "user_1",
  role: "OWNER" as "OWNER" | "TECH",
  /** How many times an action asked who is signed in. */
  reads: 0,
}));

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    session.reads += 1;
    return {
      userId: session.userId,
      shopId: session.shopId,
      role: session.role,
      name: "Dana Reed",
      email: "dana@shop.test",
      pv: 0,
    };
  },
  // Models the real guard: the redirect is not reachable from a test, so the
  // refusal is a throw. No bulk action uses it — which is itself the point of
  // the "same guard as the single-record path" assertions below.
  requireRole: async (...roles: string[]) => {
    session.reads += 1;
    if (!roles.includes(session.role)) throw new Error("forbidden");
    return {
      userId: session.userId,
      shopId: session.shopId,
      role: session.role,
      name: "Dana Reed",
      email: "dana@shop.test",
      pv: 0,
    };
  },
}));

vi.mock("@/lib/events", () => ({
  emitTicketEvent: vi.fn(async () => undefined),
  emitInvoiceEvent: vi.fn(async () => undefined),
  emitLeadEvent: vi.fn(async () => undefined),
  emitCustomerEvent: vi.fn(async () => undefined),
  emitPaymentEvent: vi.fn(async () => undefined),
  emitEstimateEvent: vi.fn(async () => undefined),
  emitAppointmentEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/comms", () => ({
  sendEmail: vi.fn(async () => ({ status: "sent" })),
  sendSms: vi.fn(async () => ({ status: "sent" })),
  renderEmail: () => ({ html: "", text: "" }),
  renderSms: () => "",
  appUrl: () => "https://shop.test",
}));

const { emitTicketEvent } = await import("@/lib/events");
const { sendEmail } = await import("@/lib/comms");

const tickets = await import("@/app/(app)/tickets/actions");
const invoices = await import("@/app/(app)/invoices/actions");
const leads = await import("@/app/(app)/leads/actions");

// ---------------------------------------------------------------------------
// The assertion this file exists for
// ---------------------------------------------------------------------------

/** The shop row is addressed BY the tenant id rather than filtered on it. */
const SCOPED_BY_ID = new Set(["shop.findUnique"]);

/**
 * No query issued by a bulk action may omit the tenant, and none may name a
 * different one.
 */
function expectEveryQueryScoped(shopId: string): void {
  for (const call of calls) {
    if (call.path === "$transaction") continue;

    if (SCOPED_BY_ID.has(call.path)) {
      expect((call.args.where as { id?: string }).id).toBe(shopId);
      continue;
    }

    // `createMany` writes an array; every row in it carries its own shopId.
    if (call.path.endsWith(".createMany")) {
      const rows = (call.args.data ?? []) as Record<string, unknown>[];
      expect(rows.length, `${call.path} wrote no rows`).toBeGreaterThan(0);
      for (const row of rows) expect(row.shopId).toBe(shopId);
      continue;
    }

    // `update`/`delete` by primary key are allowed only where the row was
    // fetched through a shop-scoped read first — flagged here, as in
    // tests/tenancy.test.ts, so a new one has to be looked at.
    if (/\.(update|delete)$/.test(call.path)) {
      expect(Object.keys((call.args.where ?? {}) as object)).toEqual(["id"]);
      continue;
    }

    expect(
      (call.args.where as Record<string, unknown> | undefined)?.shopId,
      `${call.path} is not scoped to a shop: ${JSON.stringify(call.args)}`,
    ).toBe(shopId);
  }
}

/** Ids the tests reuse. Length and shape are irrelevant; the `where` is not. */
const IDS = ["rec_1", "rec_2", "rec_3"];

beforeEach(() => {
  resetDb();
  session.shopId = SHOP;
  session.userId = "user_1";
  session.role = "OWNER";
  session.reads = 0;
  vi.mocked(emitTicketEvent).mockClear();
  vi.mocked(sendEmail).mockClear();
});

// ---------------------------------------------------------------------------

describe("lib/bulk.ts — the guard every endpoint runs first", () => {
  it("refuses an empty selection", () => {
    expect(bulkIds([])).toEqual({ ok: false, error: "Nothing was selected." });
  });

  it("refuses anything that is not an array of ids", () => {
    expect(bulkIds(undefined).ok).toBe(false);
    expect(bulkIds("rec_1").ok).toBe(false);
    expect(bulkIds([null, 42, {}]).ok).toBe(false);
  });

  it("de-duplicates, so a repeated id is not counted twice", () => {
    expect(bulkIds(["a", "a", "b"])).toEqual({ ok: true, ids: ["a", "b"] });
  });

  it("refuses a list over the cap, measured before de-duplication", () => {
    const huge = Array.from({ length: BULK_LIMIT + 1 }, () => "rec_1");
    expect(bulkIds(huge).ok).toBe(false);
  });

  it("takes a lower cap for the things that leave the building", () => {
    const ids = Array.from({ length: BULK_SEND_LIMIT + 1 }, (_, i) => `rec_${i}`);
    expect(bulkIds(ids, BULK_SEND_LIMIT).ok).toBe(false);
    expect(bulkIds(ids.slice(0, BULK_SEND_LIMIT), BULK_SEND_LIMIT).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("tickets — bulk assign", () => {
  function stubTech(shopId: string = SHOP): void {
    handlers["user.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === shopId
        ? { id: "user_tech", name: "Marcus Webb" }
        : null;
    };
    handlers["ticket.updateMany"] = () => ({ count: 3 });
  }

  it("scopes the update to the session's shop and counts what moved", async () => {
    stubTech();

    const result = await tickets.bulkAssignTicketsAction(IDS, "user_tech");

    expect(result).toEqual({
      ok: true,
      count: 3,
      message: "3 tickets assigned to Marcus Webb",
    });
    expect(whereOf("ticket.updateMany")).toEqual({
      id: { in: IDS },
      shopId: SHOP,
    });
    expectEveryQueryScoped(SHOP);
    expect(session.reads).toBe(1);
  });

  it("reads shopId from the SESSION, never from the caller", async () => {
    session.shopId = OTHER;
    stubTech(OTHER);

    await tickets.bulkAssignTicketsAction(IDS, "user_tech");

    // Same arguments, different signed-in shop: every `where` follows the
    // session. There is no parameter the caller could have used to do this.
    expectEveryQueryScoped(OTHER);
  });

  it("writes NOTHING for an empty selection", async () => {
    const result = await tickets.bulkAssignTicketsAction([], "user_tech");

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("writes NOTHING for a selection over the cap", async () => {
    const huge = Array.from({ length: BULK_LIMIT + 1 }, (_, i) => `rec_${i}`);

    const result = await tickets.bulkAssignTicketsAction(huge, "user_tech");

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a technician from another shop instead of unassigning", async () => {
    // The roster lookup is scoped, so a foreign user id resolves to nothing.
    stubTech(OTHER);

    const result = await tickets.bulkAssignTicketsAction(IDS, "user_tech");

    expect(result).toEqual({
      ok: false,
      error: "That technician is not on this team.",
    });
    // The dangerous outcome would be treating "not found" as "assign to
    // nobody" and clearing the tech on three live jobs.
    expect(callsTo("ticket.updateMany")).toEqual([]);
  });

  it("unassigns on an explicit null, without a roster lookup", async () => {
    handlers["ticket.updateMany"] = () => ({ count: 1 });

    const result = await tickets.bulkAssignTicketsAction(["rec_1"], null);

    expect(result).toEqual({
      ok: true,
      count: 1,
      message: "1 ticket unassigned",
    });
    expect(callsTo("user.findFirst")).toEqual([]);
    expect(callsTo("ticket.updateMany")[0]?.args.data).toEqual({
      assignedToId: null,
    });
  });
});

// ---------------------------------------------------------------------------

describe("tickets — bulk status change", () => {
  /** `owner` is the shop the rows actually belong to — the scoped read's job. */
  function stubTickets(
    rows: { id: string; status: string }[],
    owner: string = SHOP,
  ): void {
    handlers["shop.findUnique"] = () => ({ settings: null });
    handlers["ticket.findMany"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === owner ? rows : [];
    };
    handlers["ticket.updateMany"] = (args) => ({
      count: ((args.where as { id?: { in?: string[] } }).id?.in ?? []).length,
    });
    handlers["ticketComment.createMany"] = (args) => ({
      count: (args.data as unknown[]).length,
    });
  }

  it("scopes every read and write, and skips the ones already there", async () => {
    stubTickets([
      { id: "rec_1", status: "New" },
      { id: "rec_2", status: "In Progress" },
      // Already in the target status: touching it would restate its clock and
      // post a note saying nothing happened.
      { id: "rec_3", status: "Ready for Pickup" },
    ]);

    const result = await tickets.bulkTicketStatusAction(IDS, "Ready for Pickup");

    expect(result).toEqual({
      ok: true,
      count: 2,
      message: "2 tickets moved to Ready for Pickup",
    });
    expect(whereOf("ticket.updateMany")).toEqual({
      id: { in: ["rec_1", "rec_2"] },
      shopId: SHOP,
    });
    expectEveryQueryScoped(SHOP);
  });

  it("writes the same timeline comment the single-ticket path writes", async () => {
    stubTickets([{ id: "rec_1", status: "New" }]);

    await tickets.bulkTicketStatusAction(["rec_1"], "In Progress");

    expect(callsTo("ticketComment.createMany")[0]?.args.data).toEqual([
      {
        shopId: SHOP,
        ticketId: "rec_1",
        authorId: "user_1",
        body: "Status changed to In Progress.",
        isPublic: false,
        updateType: "In Progress",
        channel: "NOTE",
      },
    ]);
  });

  it("fires one webhook per moved ticket, and the resolution event too", async () => {
    stubTickets([
      { id: "rec_1", status: "New" },
      { id: "rec_2", status: "New" },
    ]);

    await tickets.bulkTicketStatusAction(["rec_1", "rec_2"], "Resolved");

    // status_changed twice, resolved twice — a bulk move that skipped the
    // webhook would make every subscriber's history wrong.
    expect(vi.mocked(emitTicketEvent).mock.calls.map((call) => call[1])).toEqual([
      "ticket.status_changed",
      "ticket.resolved",
      "ticket.status_changed",
      "ticket.resolved",
    ]);
    expect(
      (callsTo("ticket.updateMany")[0]?.args.data as { resolvedAt: Date | null })
        .resolvedAt,
    ).toBeInstanceOf(Date);
  });

  it("clears the resolution stamp on the way back out", async () => {
    stubTickets([{ id: "rec_1", status: "Resolved" }]);

    await tickets.bulkTicketStatusAction(["rec_1"], "In Progress");

    expect(
      (callsTo("ticket.updateMany")[0]?.args.data as { resolvedAt: Date | null })
        .resolvedAt,
    ).toBeNull();
  });

  it("refuses a status the shop does not have", async () => {
    stubTickets([{ id: "rec_1", status: "New" }]);

    const result = await tickets.bulkTicketStatusAction(IDS, "Escalated");

    expect(result.ok).toBe(false);
    // The shop's settings were read to find that out; nothing was touched.
    expect(callsTo("ticket.updateMany")).toEqual([]);
    expect(callsTo("ticketComment.createMany")).toEqual([]);
  });

  it("writes NOTHING for an empty selection", async () => {
    const result = await tickets.bulkTicketStatusAction([], "Resolved");

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("touches nothing when a foreign selection matches no rows", async () => {
    // The tickets belong to shop_1; the session is signed in to shop_2.
    stubTickets([{ id: "rec_1", status: "New" }], SHOP);
    session.shopId = OTHER;

    const result = await tickets.bulkTicketStatusAction(IDS, "Resolved");

    expect(result).toEqual({ ok: true, count: 0, message: "Already Resolved" });
    expect(callsTo("ticket.updateMany")).toEqual([]);
    expect(vi.mocked(emitTicketEvent)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("invoices — bulk mark sent", () => {
  it("moves only this shop's drafts", async () => {
    handlers["invoice.updateMany"] = () => ({ count: 2 });

    const result = await invoices.bulkMarkInvoicesSentAction(IDS);

    expect(result).toEqual({
      ok: true,
      count: 2,
      message: "2 invoices marked sent",
    });
    expect(whereOf("invoice.updateMany")).toEqual({
      id: { in: IDS },
      shopId: SHOP,
      // The status filter is what stops this walking a SENT/PAID/VOID invoice
      // backwards, whatever the caller selected.
      status: "DRAFT",
    });
    expectEveryQueryScoped(SHOP);
  });

  it("says so when nothing in the selection was still a draft", async () => {
    handlers["invoice.updateMany"] = () => ({ count: 0 });

    expect(await invoices.bulkMarkInvoicesSentAction(IDS)).toEqual({
      ok: false,
      error: "None of those are still drafts.",
    });
  });

  it("writes NOTHING for an empty selection", async () => {
    const result = await invoices.bulkMarkInvoicesSentAction([]);

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("writes NOTHING for a selection over the cap", async () => {
    const huge = Array.from({ length: BULK_LIMIT + 1 }, (_, i) => `rec_${i}`);

    expect((await invoices.bulkMarkInvoicesSentAction(huge)).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("invoices — bulk send", () => {
  function invoiceRow(over: Record<string, unknown> = {}) {
    return {
      id: "rec_1",
      number: 1042,
      status: "DRAFT",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      dueDate: null,
      taxRateBps: 0,
      publicToken: "tok_1",
      customerId: "cus_1",
      ticketId: null,
      customer: {
        firstName: "Ana",
        email: "ana@example.test",
        mobile: null,
        emailOptIn: true,
        smsOptIn: false,
      },
      lines: [{ quantity: 1, unitPriceCents: 5_000, taxable: false }],
      payments: [],
      refunds: [],
      shop: { name: "Bench & Board" },
      ...over,
    };
  }

  function stubInvoices(rows: Record<string, Record<string, unknown>>): void {
    handlers["invoice.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { id?: string; shopId?: string };
      if (where.shopId !== session.shopId) return null;
      return rows[where.id ?? ""] ?? null;
    };
    handlers["invoice.update"] = () => ({ id: "rec_1" });
  }

  it("re-reads every invoice scoped, and marks a delivered draft sent", async () => {
    stubInvoices({ rec_1: invoiceRow() });

    const result = await invoices.bulkSendInvoicesAction(["rec_1"]);

    expect(result).toEqual({ ok: true, count: 1, message: "1 invoice emailed" });
    expect(whereOf("invoice.findFirst")).toEqual({ id: "rec_1", shopId: SHOP });
    expect(callsTo("invoice.update")[0]?.args.data).toEqual({ status: "SENT" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expectEveryQueryScoped(SHOP);
  });

  it("skips a foreign id rather than sending anything for it", async () => {
    stubInvoices({ rec_1: invoiceRow() });

    // The scoped read is what makes this true: the id resolves to nothing.
    const result = await invoices.bulkSendInvoicesAction(["rec_foreign"]);

    expect(result.ok).toBe(false);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    expect(callsTo("invoice.update")).toEqual([]);
  });

  it("skips void, empty and unreachable invoices, and counts them", async () => {
    stubInvoices({
      rec_1: invoiceRow(),
      rec_2: invoiceRow({ id: "rec_2", status: "VOID" }),
      rec_3: invoiceRow({ id: "rec_3", lines: [] }),
      rec_4: invoiceRow({
        id: "rec_4",
        customer: {
          firstName: "Bo",
          email: null,
          mobile: null,
          emailOptIn: true,
          smsOptIn: false,
        },
      }),
    });

    const result = await invoices.bulkSendInvoicesAction([
      "rec_1",
      "rec_2",
      "rec_3",
      "rec_4",
    ]);

    expect(result).toEqual({
      ok: true,
      count: 1,
      message: "1 invoice emailed · 3 skipped",
    });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
  });

  it("writes NOTHING for an empty selection", async () => {
    const result = await invoices.bulkSendInvoicesAction([]);

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("refuses more than one screenful, before a single message goes out", async () => {
    const many = Array.from({ length: BULK_SEND_LIMIT + 1 }, (_, i) => `rec_${i}`);

    const result = await invoices.bulkSendInvoicesAction(many);

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("leads — bulk status change", () => {
  it("scopes the update and never touches a converted lead", async () => {
    handlers["lead.updateMany"] = () => ({ count: 3 });

    const result = await leads.bulkLeadStatusAction(IDS, "CLOSED");

    expect(result).toEqual({ ok: true, count: 3, message: "3 leads archived" });
    expect(whereOf("lead.updateMany")).toEqual({
      id: { in: IDS },
      shopId: SHOP,
      // A lead that already became a customer and a ticket cannot be dragged
      // back into the inbox by a batch.
      status: { not: "CONVERTED" },
    });
    expectEveryQueryScoped(SHOP);
  });

  it("follows the session to another shop", async () => {
    session.shopId = OTHER;
    handlers["lead.updateMany"] = () => ({ count: 1 });

    await leads.bulkLeadStatusAction(IDS, "CONTACTED");

    expectEveryQueryScoped(OTHER);
  });

  it("refuses CONVERTED — that is a workflow, not a status", async () => {
    const result = await leads.bulkLeadStatusAction(IDS, "CONVERTED");

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a status that is not a status at all", async () => {
    expect((await leads.bulkLeadStatusAction(IDS, "ARCHIVED")).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("writes NOTHING for an empty selection", async () => {
    const result = await leads.bulkLeadStatusAction([], "CLOSED");

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("writes NOTHING for a selection over the cap", async () => {
    const huge = Array.from({ length: BULK_LIMIT + 1 }, (_, i) => `rec_${i}`);

    expect((await leads.bulkLeadStatusAction(huge, "CLOSED")).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("the guard itself", () => {
  it("fails when a bulk query forgets the tenant, so these tests can be trusted", async () => {
    // A deliberately unscoped `updateMany` — the exact line this file exists to
    // keep out of the codebase — to prove the assertion above is not vacuous.
    handlers["ticket.updateMany"] = () => ({ count: 9 });
    await (
      fakeClient.ticket as { updateMany: (a: object) => Promise<unknown> }
    ).updateMany({ where: { id: { in: IDS } } });

    expect(() => expectEveryQueryScoped(SHOP)).toThrow();
  });
});
