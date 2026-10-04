import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";
import { clearRateLimit } from "@/lib/rate-limit";

/**
 * The inventory assistant (lib/ai/assistant.ts + app/(app)/assistant/actions.ts).
 *
 * Two things matter and both are decidable from the intent the model returns and
 * the queries the server runs:
 *   1. It is TOOL-CONSTRAINED — an off-topic ask ("write a website") can only
 *      come back as `refuse`, never as an action.
 *   2. A removal is STAGED — it returns `confirm` and changes nothing until the
 *      explicit confirm step runs, which deactivates (never hard-deletes).
 */

// The model call and the inventory write-actions are stubbed; everything else
// is the real assistant code.
const { generateMock, quickAddMock, adjustStockMock, bulkStatusMock, postUpdateMock, notifyReadyMock } =
  vi.hoisted(() => ({
    generateMock: vi.fn(),
    quickAddMock: vi.fn(),
    adjustStockMock: vi.fn(),
    bulkStatusMock: vi.fn(),
    postUpdateMock: vi.fn(),
    notifyReadyMock: vi.fn(),
  }));

vi.mock("@/lib/ai", () => ({ generate: generateMock }));
vi.mock("@/app/(app)/inventory/actions", () => ({
  quickAddProductAction: quickAddMock,
  adjustStockAction: adjustStockMock,
}));
vi.mock("@/app/(app)/tickets/actions", () => ({
  bulkTicketStatusAction: bulkStatusMock,
  postUpdateAction: postUpdateMock,
  notifyReadyForPickupAction: notifyReadyMock,
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/events", () => ({ emitCustomerEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const { parseIntent } = await import("@/lib/ai/assistant");
const { runAssistantAction, confirmRemoveProductAction, confirmAssistantAction } = await import(
  "@/app/(app)/assistant/actions"
);

/** Make the model "say" a given intent object. */
function says(intent: unknown) {
  generateMock.mockResolvedValue({ ok: true, text: JSON.stringify(intent) });
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  clearRateLimit("assistant:shop_1:user_1");
  resetDb();
  generateMock.mockReset();
  quickAddMock.mockReset();
  adjustStockMock.mockReset();
  bulkStatusMock.mockReset();
  postUpdateMock.mockReset();
  notifyReadyMock.mockReset();
  session.role = "OWNER";
  // Every command reads the shop's own status list for the model's context,
  // and spends one unit of the shop's daily AI allowance first.
  handlers["shop.findUnique"] = () => ({ settings: null });
  handlers["usageCounter.upsert"] = () => ({ count: 1 });
});

describe("parseIntent", () => {
  it("falls back to clarify on unparseable or off-schema replies", () => {
    expect(parseIntent("not json").action).toBe("clarify");
    expect(parseIntent('{"action":"launch_missiles"}').action).toBe("clarify");
  });

  it("accepts a valid intent, ignoring surrounding prose", () => {
    const intent = parseIntent('sure: {"action":"search_products","query":"iphone"} ok');
    expect(intent).toMatchObject({ action: "search_products", query: "iphone" });
  });
});

describe("runAssistantAction", () => {
  it("refuses anything off-topic without touching the shop", async () => {
    says({ action: "refuse", message: "I only help with your shop's inventory." });
    const result = await runAssistantAction("write me a website");
    expect(result).toMatchObject({ kind: "refused" });
    expect(callsTo("product.create")).toHaveLength(0);
  });

  it("passes a clarify question through", async () => {
    says({ action: "clarify", message: "Which product?" });
    const result = await runAssistantAction("remove it");
    expect(result).toEqual({ kind: "info", message: "Which product?", continuation: "remove it" });
  });

  it("returns the original command so a short clarification answer can continue it", async () => {
    says({ action: "clarify", message: "How many?" });
    const result = await runAssistantAction("add some iPhone 10 screens");
    expect(result).toEqual({
      kind: "info",
      message: "How many?",
      continuation: "add some iPhone 10 screens",
    });
  });

  it("adds a product via Quick Add and reports the minted SKU", async () => {
    says({
      action: "add_product",
      name: "iPhone 6 Screen",
      price: null,
      quantity: 40,
      category: "Screens",
    });
    handlers["product.findFirst"] = () => null; // no existing product with that name
    quickAddMock.mockResolvedValue({
      ok: true,
      productId: "p1",
      name: "iPhone 6 Screen",
      sku: "IPHO-1000",
    });

    const result = await runAssistantAction("add 40 iphone 6 screens");

    expect(result).toMatchObject({ kind: "done" });
    expect(result.kind === "done" && result.message).toContain("IPHO-1000");
    expect(result.kind === "done" && result.message).toContain("40 in stock");
    // The name and quantity reached Quick Add.
    const form = quickAddMock.mock.calls[0][1] as FormData;
    expect(form.get("name")).toBe("iPhone 6 Screen");
    expect(form.get("stockQty")).toBe("40");
  });

  it("restocks an existing product instead of duplicating it or asking again", async () => {
    says({ action: "add_product", name: "iPhone X Screen", price: 40, quantity: 1 });
    let reads = 0;
    handlers["product.findFirst"] = () =>
      reads++ === 0
        ? { id: "p1", name: "iPhone X Screen", serialized: false, stockQty: -2, priceCents: 3500 }
        : { stockQty: -1 };
    adjustStockMock.mockResolvedValue({ ok: true });

    const result = await runAssistantAction("make one iphone x screen available in stock for $40");

    // The stock moved, by id, and the price is one tap away rather than silent.
    const [productId, , form] = adjustStockMock.mock.calls[0] as [string, unknown, FormData];
    expect(productId).toBe("p1");
    expect(form.get("amount")).toBe("1");
    expect(result).toMatchObject({ kind: "confirm", pending: { type: "set_price", productId: "p1", priceCents: 4000 } });
    expect(quickAddMock).not.toHaveBeenCalled();
  });

  it("just restocks when the price already matches", async () => {
    says({ action: "add_product", name: "iPhone 6 Screen", price: null, quantity: 5 });
    let reads = 0;
    handlers["product.findFirst"] = () =>
      reads++ === 0
        ? { id: "p2", name: "iPhone 6 Screen", serialized: false, stockQty: 3, priceCents: 2500 }
        : { stockQty: 8 };
    adjustStockMock.mockResolvedValue({ ok: true });

    const result = await runAssistantAction("add 5 iphone 6 screens");

    expect(result).toMatchObject({ kind: "done" });
    expect(result.kind === "done" && result.message).toContain("8 in stock");
    expect(quickAddMock).not.toHaveBeenCalled();
  });

  it("summarises a search", async () => {
    says({ action: "search_products", query: "iphone" });
    handlers["product.findMany"] = () => [
      { name: "iPhone 6 Screen", stockQty: 12, priceCents: 4000, active: true },
      { name: "iPhone 7 Screen", stockQty: 0, priceCents: 4500, active: false },
    ];

    const result = await runAssistantAction("how many iphone screens");

    expect(result.kind).toBe("info");
    expect(result.kind === "info" && result.message).toContain("Found 2");
    expect(result.kind === "info" && result.message).toContain("iPhone 6 Screen");
  });

  it("suggests screen guards after a misheard screen-card lookup and never writes stock", async () => {
    says({ action: "search_products", query: "screen card" });
    let lookups = 0;
    handlers["product.findMany"] = () => ++lookups === 1 ? [] : [
      { id: "p-guard", name: "Screen guards", sku: "GUARD", category: "Accessories", stockQty: 20, priceCents: 1500 },
      { id: "p-battery", name: "Battery", sku: "BATT", category: "Parts", stockQty: 5, priceCents: 2500 },
    ];
    const result = await runAssistantAction("can you check stock for like screen cards");
    expect(result).toMatchObject({ kind: "info", links: [{ label: "Screen guards", href: "/inventory/p-guard" }] });
    expect(result.kind === "info" && result.message).toContain("Did you mean");
    expect(adjustStockMock).not.toHaveBeenCalled();
    for (const call of callsTo("product.findMany")) expect(call.args.where).toMatchObject({ shopId: "shop_1" });
  });

  it("restocks by a signed amount through the audited stock action", async () => {
    says({ action: "adjust_stock", product: "iphone 6 screen", amount: 20 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone 6 Screen", serialized: false, stockQty: 12 },
    ];
    adjustStockMock.mockResolvedValue({ ok: true });
    handlers["product.findFirst"] = () => ({ stockQty: 32 });

    const result = await runAssistantAction("add 20 to iphone 6 screens");

    expect(result).toMatchObject({ kind: "done" });
    expect(result.kind === "done" && result.message).toContain("32 in stock");
    const [productId, , form] = adjustStockMock.mock.calls[0] as [string, unknown, FormData];
    expect(productId).toBe("p1");
    expect(form.get("mode")).toBe("delta");
    expect(form.get("amount")).toBe("20");
    expect(form.get("reason")).toBe("Received");
  });

  it("adds to stock that is already below zero", async () => {
    says({ action: "adjust_stock", product: "iphone x screen", amount: 1 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone X Screen", serialized: false, stockQty: -2 },
    ];
    adjustStockMock.mockResolvedValue({ ok: true });
    handlers["product.findFirst"] = () => ({ stockQty: -1 });

    const result = await runAssistantAction("yes add 1 more in stock");

    expect(result).toMatchObject({ kind: "done" });
    const [, , form] = adjustStockMock.mock.calls[0] as [string, unknown, FormData];
    expect(form.get("amount")).toBe("1");
  });

  it("still refuses to take off more than there is", async () => {
    says({ action: "adjust_stock", product: "iphone x screen", amount: -5 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone X Screen", serialized: false, stockQty: 2 },
    ];

    const result = await runAssistantAction("remove 5 iphone x screens");

    expect(result).toMatchObject({ kind: "error" });
    expect(adjustStockMock).not.toHaveBeenCalled();
  });

  it("sets stock to an exact count", async () => {
    says({ action: "set_stock", product: "iphone 6 screen", count: 50 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone 6 Screen", serialized: false, stockQty: 12 },
    ];
    adjustStockMock.mockResolvedValue({ ok: true });
    handlers["product.findFirst"] = () => ({ stockQty: 50 });

    const result = await runAssistantAction("set iphone 6 screen stock to 50");

    expect(result).toMatchObject({ kind: "done" });
    const [, , form] = adjustStockMock.mock.calls[0] as [string, unknown, FormData];
    expect(form.get("mode")).toBe("count");
    expect(form.get("amount")).toBe("50");
    expect(form.get("reason")).toBe("Counted");
  });

  it("stages a price change as was → now, and writes nothing until confirmed", async () => {
    says({ action: "set_price", product: "iphone 6 screen", price: 45 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone 6 Screen", serialized: false, stockQty: 12 },
    ];
    handlers["product.findFirst"] = () => ({ priceCents: 3999 });

    const result = await runAssistantAction("change iphone 6 screen price to 45");

    expect(result).toMatchObject({
      kind: "confirm",
      pending: { type: "set_price", productId: "p1", priceCents: 4500 },
    });
    expect(result.message).toContain("$39.99");
    expect(callsTo("product.update")).toHaveLength(0);
  });

  it("won't number-adjust a serialized product, and touches no stock", async () => {
    says({ action: "adjust_stock", product: "iphone", amount: 5 });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone 6", serialized: true, stockQty: 0 },
    ];

    const result = await runAssistantAction("add 5 iphones");

    expect(result.kind).toBe("info");
    expect(result.kind === "info" && result.message).toContain("serial");
    expect(adjustStockMock).not.toHaveBeenCalled();
  });

  it("lists low-stock products to restock", async () => {
    says({ action: "low_stock" });
    handlers["product.findMany"] = () => [
      { name: "iPhone 6 Screen", stockQty: 2, lowStockAt: 5, reorderQty: 10 },
      { name: "USB-C Cable", stockQty: 0, lowStockAt: 3, reorderQty: null },
    ];

    const result = await runAssistantAction("what's running low");

    expect(result.kind).toBe("info");
    expect(result.kind === "info" && result.message).toContain("2 to restock");
    expect(result.kind === "info" && result.message).toContain("iPhone 6 Screen");
    expect(result.kind === "info" && result.message).toContain("reorder ~10");
  });

  it("reports well-stocked when nothing is below its reorder point", async () => {
    says({ action: "low_stock" });
    handlers["product.findMany"] = () => [];
    const result = await runAssistantAction("anything low?");
    expect(result.kind === "info" && result.message).toContain("well stocked");
  });

  it("lists repair tickets filtered by status", async () => {
    says({ action: "find_tickets", status: "Ready for Pickup", customer: null });
    handlers["ticket.findMany"] = () => [
      {
        number: 1042,
        subject: "Screen replacement",
        status: "Ready for Pickup",
        customer: { firstName: "John", lastName: "Doe", businessName: null },
      },
    ];

    const result = await runAssistantAction("what's ready for pickup");

    expect(result.kind).toBe("info");
    expect(result.kind === "info" && result.message).toContain("#1042");
    expect(result.kind === "info" && result.message).toContain("John Doe");
    expect(whereOf("ticket.findMany")).toMatchObject({
      shopId: "shop_1",
      status: { contains: "Ready for Pickup", mode: "insensitive" },
    });
  });

  it("stages a single-match removal as a confirm, changing nothing yet", async () => {
    says({ action: "remove_product", product: "iphone 6 screen" });
    handlers["product.findMany"] = () => [{ id: "p1", name: "iPhone 6 Screen" }];

    const result = await runAssistantAction("delete the iphone 6 screen");

    expect(result).toMatchObject({
      kind: "confirm",
      remove: { productId: "p1", name: "iPhone 6 Screen" },
    });
    expect(callsTo("product.update")).toHaveLength(0);
  });

  it("asks which one when a removal is ambiguous", async () => {
    says({ action: "remove_product", product: "screen" });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "iPhone 6 Screen" },
      { id: "p2", name: "iPhone 7 Screen" },
    ];

    const result = await runAssistantAction("remove the screen");

    expect(result.kind).toBe("info");
    expect(result.kind === "info" && result.message).toContain("More than one");
    expect(callsTo("product.update")).toHaveLength(0);
  });
});

describe("confirmRemoveProductAction", () => {
  it("deactivates the product (never hard-deletes) after confirmation", async () => {
    handlers["product.findFirst"] = () => ({ id: "p1", name: "iPhone 6 Screen" });
    handlers["product.update"] = () => ({ id: "p1" });

    const result = await confirmRemoveProductAction("p1");

    expect(result).toMatchObject({ kind: "done" });
    expect(dataOf("product.update")).toEqual({ active: false });
  });

  it("reports gone when the product no longer belongs to the shop", async () => {
    handlers["product.findFirst"] = () => null;
    const result = await confirmRemoveProductAction("p1");
    expect(result).toMatchObject({ kind: "error" });
    expect(callsTo("product.update")).toHaveLength(0);
  });
});

describe("the wider shop assistant", () => {
  it.each([
    ["today", "2026-09-30T06:00:00.000Z", "2026-10-01T03:00:00.000Z"],
    ["yesterday", "2026-09-29T06:00:00.000Z", "2026-09-30T06:00:00.000Z"],
    ["this week", "2026-09-28T06:00:00.000Z", "2026-10-01T03:00:00.000Z"],
    ["this month", "2026-09-01T06:00:00.000Z", "2026-10-01T03:00:00.000Z"],
  ])("reads sales %s on the shop calendar and ignores failed refunds", async (period, from, to) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
    handlers["shop.findUnique"] = () => ({ settings: null, timezone: "America/Edmonton" });
    handlers["payment.aggregate"] = () => ({ _sum: { amountCents: 10000 }, _count: { _all: 1 } });
    handlers["refund.aggregate"] = () => ({ _sum: { amountCents: 2000 } });
    handlers["ticket.count"] = () => 0;
    const result = await runAssistantAction(`sales ${period}`);
    expect(result).toMatchObject({ kind: "info", message: expect.stringContaining("$80.00 taken") });
    const window = whereOf("payment.aggregate").createdAt as { gte: Date; lt: Date };
    expect(window.gte.toISOString()).toBe(from);
    expect(window.lt.toISOString()).toBe(to);
    expect(whereOf("refund.aggregate")).toMatchObject({ shopId: "shop_1", status: { not: "failed" }, createdAt: window });
  });

  it("reads tomorrow's spring-change bookings as a 23-hour shop day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-08T03:00:00Z"));
    handlers["shop.findUnique"] = () => ({ settings: null, timezone: "America/Edmonton" });
    handlers["appointment.findMany"] = () => [{ id: "a1", title: "Drop-off", startsAt: new Date("2026-03-08T15:00:00Z"), customer: null }];
    const result = await runAssistantAction("appointments tomorrow");
    expect(result).toMatchObject({ kind: "info", links: [{ label: "9 AM · Drop-off" }] });
    const range = whereOf("appointment.findMany").startsAt as { gte: Date; lt: Date };
    expect(range.gte.toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-03-09T06:00:00.000Z");
  });

  it("finds refunded paid invoices and an older debt behind ten settled invoices", async () => {
    const base = { taxRateBps: 0, status: "PAID", lines: [{ quantity: 1, unitPriceCents: 10000, taxable: false }], payments: [{ amountCents: 10000 }], refunds: [], customer: { firstName: "Ada", lastName: "Lovelace", businessName: null } };
    handlers["invoice.findMany"] = () => [
      ...Array.from({ length: 10 }, (_, i) => ({ ...base, id: `paid_${i}`, number: i + 1 })),
      { ...base, id: "reopened", number: 11, refunds: [{ amountCents: 2000, status: "completed" }] },
    ];
    const result = await runAssistantAction("unpaid invoices");
    expect(result).toMatchObject({ kind: "info", message: expect.stringContaining("$20.00 owing"), links: [{ href: "/invoices/reopened" }] });
    expect(whereOf("invoice.findMany")).toMatchObject({ shopId: "shop_1", status: { in: ["SENT", "PARTIAL", "PAID"] } });
    expect(callsTo("invoice.findMany")[0].args.take).toBeUndefined();
  });

  it("stages a status move against the shop's OWN status list", async () => {
    says({ action: "set_ticket_status", ticket: 1042, status: "ready for pickup" });
    handlers["ticket.findFirst"] = () => ({
      id: "t1",
      number: 1042,
      subject: "Screen replacement",
      status: "In Progress",
    });

    const result = await runAssistantAction("mark 1042 ready");

    expect(result).toMatchObject({
      kind: "confirm",
      pending: { type: "set_ticket_status", ticketId: "t1", status: "Ready for Pickup" },
    });
    expect(whereOf("ticket.findFirst")).toEqual({ shopId: "shop_1", number: 1042 });
    expect(bulkStatusMock).not.toHaveBeenCalled();
  });

  it("refuses a status the shop does not have instead of writing it", async () => {
    says({ action: "set_ticket_status", ticket: 1042, status: "Exploded" });
    handlers["ticket.findFirst"] = () => ({ id: "t1", number: 1042, subject: "x", status: "New" });

    const result = await runAssistantAction("mark 1042 exploded");

    expect(result.kind).toBe("info");
    expect(bulkStatusMock).not.toHaveBeenCalled();
  });

  it("runs a confirmed status move through the ticket action, scoped to the shop", async () => {
    handlers["ticket.findFirst"] = () => ({ id: "t1", number: 1042, subject: "x", status: "New" });
    bulkStatusMock.mockResolvedValue({ ok: true, count: 1, message: "Moved" });

    const result = await confirmAssistantAction({
      type: "set_ticket_status",
      ticketId: "t1",
      status: "Ready for Pickup",
    });

    expect(result.kind).toBe("done");
    expect(whereOf("ticket.findFirst")).toEqual({ id: "t1", shopId: "shop_1" });
    expect(bulkStatusMock).toHaveBeenCalledWith(["t1"], "Ready for Pickup");
  });

  it("touches NOTHING when a confirm arrives without its id", async () => {
    // Prisma drops `undefined` from a where — a missing id must die at the door,
    // not reach a query as `{ shopId }` alone.
    for (const payload of [
      { type: "set_ticket_status", status: "Resolved" },
      { type: "set_price", priceCents: 1 },
      { type: "notify_ready", ticketId: "" },
      { type: "drop_tables" },
      null,
    ]) {
      const result = await confirmAssistantAction(payload);
      expect(result.kind).toBe("error");
    }
    expect(calls).toHaveLength(0);
    expect(bulkStatusMock).not.toHaveBeenCalled();
    expect(notifyReadyMock).not.toHaveBeenCalled();
  });

  it("keeps a dictated note staff-only", async () => {
    handlers["ticket.findFirst"] = () => ({ id: "t1", number: 1042, subject: "x", status: "New" });
    postUpdateMock.mockResolvedValue({ ok: true });

    await confirmAssistantAction({ type: "add_ticket_note", ticketId: "t1", note: "Battery swollen" });

    const [, , form] = postUpdateMock.mock.calls[0] as [string, unknown, FormData];
    expect(form.get("body")).toBe("Battery swollen");
    expect(form.get("isPublic")).toBeNull();
  });

  it("refuses before calling the model once the shop's daily allowance is spent", async () => {
    handlers["usageCounter.upsert"] = (args) =>
      (args as { where: { shopId_key_day: { shopId: string } } }).where.shopId_key_day.shopId === "*"
        ? { count: 1 }
        : { count: 401 };

    const result = await runAssistantAction("show all repairs for Sarah that are waiting for parts");
    expect(result.kind).toBe("error");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("answers quick requests with fresh tenant-scoped rows without spending AI quota", async () => {
    handlers["ticket.findMany"] = () => [];
    handlers["usageCounter.upsert"] = () => { throw new Error("Quota must not be touched"); };
    expect(await runAssistantAction("my repairs")).toMatchObject({ kind: "info" });
    expect(whereOf("ticket.findMany")).toMatchObject({ shopId: "shop_1", assignedToId: "user_1" });
    await runAssistantAction("my repairs");
    expect(callsTo("ticket.findMany")).toHaveLength(2);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("explains capabilities without spending AI or keeping an unwanted clarification", async () => {
    expect(await runAssistantAction("What can you help me with?")).toMatchObject({ kind: "info", message: expect.stringContaining("find repairs") });
    expect(callsTo("usageCounter.upsert")).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("does not show a technician the shop's money", async () => {
    session.role = "TECH";
    says({ action: "sales_summary", period: "today" });

    const result = await runAssistantAction("how did we do today");

    expect(result.kind).toBe("refused");
    expect(callsTo("payment.aggregate")).toHaveLength(0);
  });

  it("only ever hands out its own list of pages, and keeps owner pages for the owner", async () => {
    says({ action: "open_page", page: "settings_payments", customer: null });
    session.role = "FRONT_DESK";
    expect((await runAssistantAction("payment settings")).kind).toBe("refused");

    session.role = "OWNER";
    const result = await runAssistantAction("payment settings");
    expect(result).toMatchObject({ kind: "info", links: [{ href: "/settings?tab=payments" }] });

    // A page the schema does not list cannot be asked for at all.
    expect(parseIntent('{"action":"open_page","page":"https://evil.example","customer":null}').action).toBe(
      "clarify",
    );
  });

  it("points at a customer already on file instead of adding a second one", async () => {
    says({ action: "create_customer", name: "Mike Brown", phone: "780 555 0142", email: null });
    handlers["$queryRaw"] = () => [{ id: "c9" }];
    handlers["customer.findMany"] = () => [
      { id: "c9", firstName: "Mike", lastName: "Brown", businessName: null, mobile: "7805550142", phone: null },
    ];

    const result = await runAssistantAction("add customer mike brown 780 555 0142");

    expect(result).toMatchObject({ kind: "info", links: [{ href: "/customers/c9" }] });
    expect(callsTo("customer.create")).toHaveLength(0);
  });
});
