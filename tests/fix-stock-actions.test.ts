import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * The purchasing server actions this package touched, through the recording
 * db-mock: what they write, and that every read and write stays in the
 * session's shop.
 *
 *  - New order: the same form contract, plus an optional `intent=place` that
 *    saves it as already ordered; the delivery date is a calendar day (UTC
 *    midnight), never "midnight wherever the server is".
 *  - "Order all low items": one draft per supplier, added to an existing draft,
 *    skipping what is already coming and what has no supplier.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/comms/drivers", () => ({ deliverEmail: vi.fn(async () => "sent") }));
vi.mock("@/lib/sequence", () => ({
  withNextNumber: vi.fn(async (_shopId: string, _kind: string, create: (number: number) => Promise<unknown>) => create(1005)),
}));

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const { createPurchaseOrderAction, markPurchaseOrderedAction, orderLowStockAction } = await import(
  "@/app/(app)/inventory/purchase-orders/actions"
);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const LINES = JSON.stringify([
  { productId: "p1", description: "Keyboard", quantity: 2, unitCostCents: 19500 },
  { productId: null, description: "Back glass", quantity: 1, unitCostCents: 900 },
]);

beforeEach(() => {
  resetDb();
  session.role = "OWNER";
  handlers["vendor.findFirst"] = () => ({ id: "v1" });
  handlers["product.findMany"] = () => [{ id: "p1" }];
  handlers["purchaseOrder.create"] = () => ({ id: "po_new", number: 1005, vendorId: "v1", _count: { lines: 0 } });
});

describe("createPurchaseOrderAction", () => {
  it("still saves a draft from the old fields, scoped to the shop", async () => {
    await expect(
      createPurchaseOrderAction(undefined, form({ vendorId: "v1", lines: LINES, shippingCents: "2400", notes: "Call first", expectedAt: "" })),
    ).rejects.toThrow("REDIRECT:/inventory/purchase-orders/po_new");

    expect(whereOf("vendor.findFirst")).toEqual({ id: "v1", shopId: "shop_1" });
    expect(whereOf("product.findMany")).toEqual({ id: { in: ["p1"] }, shopId: "shop_1" });
    const data = dataOf("purchaseOrder.create");
    expect(data).toMatchObject({ shopId: "shop_1", vendorId: "v1", number: 1005, status: "DRAFT", shippingCents: 2400, notes: "Call first", expectedAt: null });
    expect(data).not.toHaveProperty("orderedAt");
    // The money is exactly what was posted: integer cents, unchanged.
    expect((data.lines as { create: unknown[] }).create).toEqual([
      { productId: "p1", description: "Keyboard", quantity: 2, unitCostCents: 19500, sortOrder: 0 },
      { productId: null, description: "Back glass", quantity: 1, unitCostCents: 900, sortOrder: 1 },
    ]);
  });

  it("'Place order' saves it as ordered, stamped now", async () => {
    await expect(
      createPurchaseOrderAction(undefined, form({ vendorId: "v1", lines: LINES, shippingCents: "0", intent: "place", expectedAt: "2026-10-09" })),
    ).rejects.toThrow("REDIRECT:");
    const data = dataOf("purchaseOrder.create");
    expect(data.status).toBe("ORDERED");
    expect(data.orderedAt).toBeInstanceOf(Date);
    // The delivery day is the calendar day typed, stored as UTC midnight.
    expect((data.expectedAt as Date).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("anything other than 'place' is a draft", async () => {
    await expect(createPurchaseOrderAction(undefined, form({ vendorId: "v1", lines: LINES, intent: "draft" }))).rejects.toThrow("REDIRECT:");
    expect(dataOf("purchaseOrder.create").status).toBe("DRAFT");
  });

  it("asks who it is for when no supplier of this shop is chosen", async () => {
    handlers["vendor.findFirst"] = () => null;
    expect(await createPurchaseOrderAction(undefined, form({ vendorId: "", lines: LINES }))).toEqual({ error: "Choose who you are ordering from." });
    expect(callsTo("purchaseOrder.create")).toHaveLength(0);
  });

  it("refuses anyone but an owner", async () => {
    session.role = "FRONT_DESK";
    expect(await createPurchaseOrderAction(undefined, form({ vendorId: "v1", lines: LINES }))).toEqual({ error: "Only an owner can manage purchase orders." });
    expect(callsTo("vendor.findFirst")).toHaveLength(0);
  });
});

describe("markPurchaseOrderedAction", () => {
  it("stores the promised day as that calendar day", async () => {
    handlers["purchaseOrder.findFirst"] = () => ({ id: "po1", status: "DRAFT" });
    handlers["purchaseOrder.update"] = () => ({});
    expect(await markPurchaseOrderedAction("po1", {}, form({ expectedAt: "2026-10-04" }))).toEqual({ ok: true });
    expect(whereOf("purchaseOrder.findFirst")).toEqual({ id: "po1", shopId: "shop_1" });
    expect((dataOf("purchaseOrder.update").expectedAt as Date).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("orderLowStockAction", () => {
  const product = (over: Record<string, unknown>) => ({
    id: "p",
    name: "Part",
    stockQty: 1,
    lowStockAt: 3,
    reorderQty: null,
    costCents: 500,
    vendorId: "v1",
    vendor: { id: "v1", name: "Meridian", active: true },
    ...over,
  });

  it("adds to the supplier's open draft, starts one where there is none, and reports what it left out", async () => {
    handlers["product.findMany"] = () => [
      product({ id: "a", name: "Screen", reorderQty: 10 }),
      product({ id: "b", name: "Battery", vendorId: "v2", vendor: { id: "v2", name: "Lone Star", active: true } }),
      product({ id: "c", name: "Coming already" }),
      product({ id: "d", name: "No supplier", vendorId: null, vendor: null }),
    ];
    handlers["purchaseOrderLine.findMany"] = () => [{ productId: "c", quantity: 4, receivedQty: 0 }];
    handlers["purchaseOrder.findMany"] = () => [{ id: "draft_v1", number: 1003, vendorId: "v1", _count: { lines: 2 } }];
    handlers["purchaseOrder.create"] = () => ({ id: "draft_v2", number: 1005, vendorId: "v2", _count: { lines: 0 } });
    handlers["purchaseOrderLine.createMany"] = () => ({ count: 1 });

    const result = await orderLowStockAction();

    expect(result).toEqual({
      ok: true,
      orders: [
        { id: "draft_v2", number: 1005, vendorName: "Lone Star", lines: 1 },
        { id: "draft_v1", number: 1003, vendorName: "Meridian", lines: 1 },
      ],
      noSupplier: 1,
      alreadyOrdered: 1,
    });

    // Every read is this shop's: the low products, the open lines (through their order) and the drafts.
    expect(whereOf("product.findMany")).toMatchObject({ shopId: "shop_1", active: true });
    expect(whereOf("purchaseOrderLine.findMany")).toMatchObject({ purchaseOrder: { shopId: "shop_1" } });
    expect(whereOf("purchaseOrder.findMany")).toEqual({ shopId: "shop_1", status: "DRAFT" });
    // Only the supplier with no draft got a new one, and it is a draft, in this shop.
    expect(callsTo("purchaseOrder.create")).toHaveLength(1);
    expect(dataOf("purchaseOrder.create")).toMatchObject({ shopId: "shop_1", vendorId: "v2", status: "DRAFT", createdById: "user_1" });
    const writes = callsTo("purchaseOrderLine.createMany").map((call) => call.args.data);
    expect(writes).toEqual([
      [{ purchaseOrderId: "draft_v2", productId: "b", description: "Battery", quantity: 5, unitCostCents: 500, sortOrder: 0 }],
      // Appended after the two lines the existing draft already had.
      [{ purchaseOrderId: "draft_v1", productId: "a", description: "Screen", quantity: 10, unitCostCents: 500, sortOrder: 2 }],
    ]);
  });

  it("writes nothing when everything low is already coming", async () => {
    handlers["product.findMany"] = () => [product({ id: "c" })];
    handlers["purchaseOrderLine.findMany"] = () => [{ productId: "c", quantity: 4, receivedQty: 1 }];
    handlers["purchaseOrder.findMany"] = () => [];
    expect(await orderLowStockAction()).toEqual({ ok: true, orders: [], noSupplier: 0, alreadyOrdered: 1 });
    expect(callsTo("purchaseOrder.create")).toHaveLength(0);
  });

  it("refuses anyone but an owner, before reading anything", async () => {
    session.role = "TECHNICIAN";
    expect(await orderLowStockAction()).toEqual({ error: "Only an owner can manage purchase orders." });
    expect(callsTo("product.findMany")).toHaveLength(0);
  });
});
