import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_1", shopId: "shop_1", role: "FRONT_DESK", name: "Tess" })),
}));

const { removeChargeAction, restoreChargeAction } = await import("@/app/(app)/tickets/actions");

/**
 * A charge removed from a repair comes back with Undo: `removeChargeAction`
 * hands back exactly what the row held, and `restoreChargeAction` writes it
 * back, re-checked against the session's shop like any new charge.
 */

const SHOP = "shop_1";
const ADDED = new Date("2026-10-02T18:15:00.000Z");
const ROW = {
  id: "ch_1",
  ticketId: "tkt_1",
  productId: "prod_1",
  description: "iPhone 14 screen",
  quantity: 2,
  unitPriceCents: 12_345,
  taxable: true,
  createdAt: ADDED,
};

beforeEach(() => {
  resetDb();
  handlers["ticketCharge.findFirst"] = (args) => {
    const where = args.where as { id?: string; shopId?: string; invoiceId?: unknown };
    return where.shopId === SHOP && where.id === "ch_1" && where.invoiceId === null ? { ...ROW, ticket: { number: 1008 } } : null;
  };
  // Guarded delete: matches only while the charge is still this shop's and still on no invoice.
  handlers["ticketCharge.deleteMany"] = (args) => {
    const where = args.where as { id?: string; shopId?: string; invoiceId?: unknown };
    return { count: where.shopId === SHOP && where.id === "ch_1" && where.invoiceId === null ? 1 : 0 };
  };
  handlers["ticketCharge.create"] = (args) => ({ id: "ch_new", ...(args.data as object) });
  handlers["ticket.findFirst"] = (args) => {
    const where = args.where as { id?: string; shopId?: string };
    return where.shopId === SHOP && where.id === "tkt_1" ? { id: "tkt_1", shopId: SHOP, number: 1008, customerId: "c1", status: "New" } : null;
  };
  handlers["product.findFirst"] = (args) => {
    const where = args.where as { id?: string; shopId?: string };
    return where.shopId === SHOP && where.id === "prod_1" ? { id: "prod_1", serialized: false } : null;
  };
  // The part goes back on the shelf when its charge comes off, and off again on Undo.
  handlers["product.updateMany"] = (args) => {
    const where = args.where as { id?: string; shopId?: string };
    return { count: where.shopId === SHOP && where.id === "prod_1" ? 1 : 0 };
  };
  handlers["stockAdjustment.create"] = (args) => args.data;
});

describe("removeChargeAction", () => {
  it("removes only this shop's charge that is not on an invoice, and hands back what it was, to the cent", async () => {
    const result = await removeChargeAction("ch_1");

    expect(whereOf("ticketCharge.findFirst")).toEqual({ id: "ch_1", shopId: SHOP, invoiceId: null });
    expect(whereOf("ticketCharge.deleteMany")).toEqual({ id: "ch_1", shopId: SHOP, invoiceId: null });
    expect(result).toEqual({
      ok: true,
      removed: {
        ticketId: "tkt_1",
        productId: "prod_1",
        description: "iPhone 14 screen",
        quantity: 2,
        unitPriceCents: 12_345,
        taxable: true,
        createdAt: ADDED.toISOString(),
      },
    });
    // Both stock writes carry the shop: the two parts go back on this shop's shelf.
    expect(callsTo("product.updateMany")[0].args).toEqual({
      where: { id: "prod_1", shopId: SHOP },
      data: { stockQty: { increment: 2 } },
    });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ shopId: SHOP, productId: "prod_1", delta: 2 });
  });

  it("deletes nothing for a charge on an invoice, another shop's charge or an empty id", async () => {
    for (const id of ["ch_on_invoice", ""]) {
      resetDb();
      handlers["ticketCharge.findFirst"] = () => null;
      const result = await removeChargeAction(id);
      expect(result.ok).toBeUndefined();
      expect(callsTo("ticketCharge.deleteMany")).toEqual([]);
    }
  });
});

describe("removeChargeAction, when the charge was invoiced a moment ago", () => {
  it("offers no Undo for a row it did not delete", async () => {
    handlers["ticketCharge.deleteMany"] = () => ({ count: 0 });
    const result = await removeChargeAction("ch_1");
    expect(result.ok).toBeUndefined();
  });
});

describe("restoreChargeAction (Undo)", () => {
  it("puts back exactly the removed charge on the same repair, at the same place in the list", async () => {
    const removed = await removeChargeAction("ch_1");
    if (!removed.ok) throw new Error("expected a removal");

    const result = await restoreChargeAction(removed.removed);

    expect(result).toEqual({ ok: true });
    expect(whereOf("ticket.findFirst")).toMatchObject({ id: "tkt_1", shopId: SHOP });
    expect(dataOf("ticketCharge.create")).toEqual({
      shopId: SHOP,
      ticketId: "tkt_1",
      productId: "prod_1",
      description: "iPhone 14 screen",
      quantity: 2,
      unitPriceCents: 12_345,
      taxable: true,
      createdAt: ADDED,
    });
    // Off the shelf again: +2 on removal, -2 on Undo.
    expect(callsTo("product.updateMany").map((call) => (call.args.data as { stockQty: { increment: number } }).stockQty.increment)).toEqual([2, -2]);
  });

  it("refuses a repair from another shop and writes nothing", async () => {
    const result = await restoreChargeAction({ ...ROW, ticketId: "tkt_other", createdAt: ADDED.toISOString() });
    expect(result.error).toBeTruthy();
    expect(callsTo("ticketCharge.create")).toEqual([]);
  });

  it("drops a product that is not this shop's rather than linking it", async () => {
    await restoreChargeAction({ ...ROW, productId: "prod_elsewhere", createdAt: ADDED.toISOString() });
    expect(dataOf("ticketCharge.create").productId).toBeNull();
  });

  it("refuses numbers that are not whole or out of range, and never rounds money", async () => {
    for (const bad of [
      { quantity: 0 },
      { quantity: 1.5 },
      { unitPriceCents: 12.5 },
      { unitPriceCents: 100_000_001 },
      { description: "   " },
    ]) {
      resetDb();
      handlers["ticket.findFirst"] = () => ({ id: "tkt_1" });
      const result = await restoreChargeAction({ ...ROW, ...bad, createdAt: ADDED.toISOString() } as never);
      expect(result.error, JSON.stringify(bad)).toBeTruthy();
      expect(callsTo("ticketCharge.create")).toEqual([]);
    }
  });

  it("never dates a charge in the future", async () => {
    const before = Date.now();
    await restoreChargeAction({ ...ROW, createdAt: "2999-01-01T00:00:00.000Z" });
    const at = (dataOf("ticketCharge.create").createdAt as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});

describe("addChargeAction and updateChargeAction move stock", () => {
  it("takes a catalogue part off this shop's shelf when it is charged to a repair", async () => {
    const { addChargeAction } = await import("@/app/(app)/tickets/actions");
    handlers["product.findFirst"] = (args) => {
      const where = args.where as { id?: string; shopId?: string };
      return where.shopId === SHOP && where.id === "prod_1"
        ? { name: "iPhone 14 screen", priceCents: 12_345, taxable: true, serialized: false }
        : null;
    };
    const form = new FormData();
    form.set("productId", "prod_1");
    form.set("quantity", "2");

    expect(await addChargeAction("tkt_1", {}, form)).toEqual({ ok: true });
    expect(callsTo("product.updateMany")[0].args).toEqual({
      where: { id: "prod_1", shopId: SHOP },
      data: { stockQty: { increment: -2 } },
    });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ shopId: SHOP, productId: "prod_1", delta: -2, reason: "Used on repair #1008" });
  });

  it("moves no stock for a custom line, nor for a serial-tracked product", async () => {
    const { addChargeAction } = await import("@/app/(app)/tickets/actions");
    const custom = new FormData();
    custom.set("description", "Labour");
    custom.set("unitPrice", "45");
    await addChargeAction("tkt_1", {}, custom);

    handlers["product.findFirst"] = () => ({ name: "iPad", priceCents: 1, taxable: true, serialized: true });
    const serial = new FormData();
    serial.set("productId", "prod_1");
    await addChargeAction("tkt_1", {}, serial);

    expect(callsTo("product.updateMany")).toEqual([]);
    expect(callsTo("stockAdjustment.create")).toEqual([]);
  });

  it("moves only the difference when a part's quantity changes", async () => {
    const { updateChargeAction } = await import("@/app/(app)/tickets/actions");
    handlers["ticketCharge.findFirst"] = () => ({ ...ROW, invoiceId: null, ticket: { number: 1008 } });
    handlers["ticketCharge.updateMany"] = () => ({ count: 1 });
    const form = new FormData();
    form.set("description", "iPhone 14 screen");
    form.set("quantity", "3");
    form.set("unitPrice", "123.45");

    expect(await updateChargeAction("ch_1", {}, form)).toEqual({ ok: true });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ delta: -1 });
  });
});
