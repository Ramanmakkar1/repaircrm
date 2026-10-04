import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * Whole-number fields in the Inventory actions.
 *
 * `whole()` returns null for a blank box and NaN for something that is not a
 * whole number ("abc", "2.5"). NaN is not nullish, so a caller that only checks
 * for null would hand it to Prisma and crash. Every caller must instead answer
 * in plain words — and never touch the database with the bad value.
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

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada Lovelace" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const {
  adjustStockAction,
  setLowStockAction,
  createProductAction,
  updateProductAction,
  quickAddProductAction,
} = await import("@/app/(app)/inventory/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** Anything that must never happen for a bad number. */
function expectNoWrites(): void {
  expect(callsTo("$transaction")).toHaveLength(0);
  expect(callsTo("product.create")).toHaveLength(0);
  expect(callsTo("product.update")).toHaveLength(0);
  expect(callsTo("product.updateMany")).toHaveLength(0);
  expect(callsTo("stockAdjustment.create")).toHaveLength(0);
}

/** A message a person at the counter can act on, never zod's or Prisma's own. */
function expectPlain(message: unknown): void {
  expect(typeof message).toBe("string");
  expect(message).not.toMatch(/NaN|Invalid input|expected number|undefined|prisma/i);
}

beforeEach(() => {
  resetDb();
});

describe("adjustStockAction quantity", () => {
  beforeEach(() => {
    handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 5, serialized: false });
    handlers["product.update"] = () => ({ id: "prod_1" });
    handlers["stockAdjustment.create"] = () => ({ id: "adj_1" });
  });

  it.each(["", "   "])("asks for a quantity when the box is blank (%j)", async (amount) => {
    const result = await adjustStockAction("prod_1", {}, form({ amount, reason: "Received" }));
    expect(result).toEqual({ error: "Enter a quantity." });
    expectNoWrites();
  });

  it.each(["abc", "2.5", "12abc", "1,5", "--3", "Infinity", "1e400"])(
    "answers in plain words for %j and never reaches the database",
    async (amount) => {
      const result = await adjustStockAction("prod_1", {}, form({ amount, reason: "Received" }));
      expect(result).toEqual({ error: "Enter a quantity as a whole number, like 5." });
      expectNoWrites();
    },
  );

  it("says counted quantity when setting a count", async () => {
    const blank = await adjustStockAction("prod_1", {}, form({ mode: "count", amount: "", reason: "Counted" }));
    expect(blank).toEqual({ error: "Enter the counted quantity." });

    const typo = await adjustStockAction("prod_1", {}, form({ mode: "count", amount: "nine", reason: "Counted" }));
    expect(typo).toEqual({ error: "Enter the counted quantity as a whole number, like 5." });
    expectNoWrites();
  });

  it("still takes a signed change and a counted total", async () => {
    expect(await adjustStockAction("prod_1", {}, form({ amount: "+3", reason: "Received" }))).toEqual({ ok: true });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ shopId: "shop_1", productId: "prod_1", delta: 3 });

    resetDb();
    handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 5, serialized: false });
    handlers["product.update"] = () => ({ id: "prod_1" });
    handlers["stockAdjustment.create"] = () => ({ id: "adj_2" });
    expect(await adjustStockAction("prod_1", {}, form({ mode: "count", amount: "9", reason: "Counted" }))).toEqual({ ok: true });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ delta: 4 });
  });

  it("only touches a product this shop owns", async () => {
    await adjustStockAction("prod_1", {}, form({ amount: "1", reason: "Received" }));
    expect(whereOf("product.findFirst")).toEqual({ id: "prod_1", shopId: "shop_1" });
  });
});

describe("setLowStockAction reorder point", () => {
  beforeEach(() => {
    handlers["product.updateMany"] = () => ({ count: 1 });
  });

  it.each(["abc", "2.5", "3 or 4"])("rejects %j in plain words without writing", async (lowStockAt) => {
    const result = await setLowStockAction("prod_1", {}, form({ lowStockAt }));
    expect(result).toEqual({ error: "The reorder point must be a whole number, like 5." });
    expectNoWrites();
  });

  it("still refuses a negative reorder point", async () => {
    expect(await setLowStockAction("prod_1", {}, form({ lowStockAt: "-1" }))).toEqual({
      error: "The reorder point can't be negative.",
    });
    expectNoWrites();
  });

  it("saves a number for this shop's product, and a blank box clears it", async () => {
    expect(await setLowStockAction("prod_1", {}, form({ lowStockAt: "5" }))).toEqual({ ok: true });
    expect(whereOf("product.updateMany")).toEqual({ id: "prod_1", shopId: "shop_1" });
    expect(dataOf("product.updateMany")).toEqual({ lowStockAt: 5 });

    resetDb();
    handlers["product.updateMany"] = () => ({ count: 1 });
    expect(await setLowStockAction("prod_1", {}, form({ lowStockAt: "" }))).toEqual({ ok: true });
    expect(dataOf("product.updateMany")).toEqual({ lowStockAt: null });
  });
});

describe("product form whole-number fields", () => {
  const base = { name: "Screen", price: "10" };

  it.each([
    ["stockQty", "Stock must be a whole number, like 5."],
    ["lowStockAt", "The reorder point must be a whole number, like 5."],
    ["reorderQty", "Reorder quantity must be a whole number, like 5."],
    ["warrantyDays", "Warranty must be a whole number, like 5."],
  ])("shows a plain message under %s for text or a decimal, and saves nothing", async (field, message) => {
    for (const bad of ["abc", "2.5"]) {
      resetDb();
      const result = await createProductAction(undefined, form({ ...base, [field]: bad }));
      expect(result).toMatchObject({ fieldErrors: { [field]: message } });
      expectPlain((result as { fieldErrors: Record<string, string> }).fieldErrors[field]);
      expectNoWrites();
    }
  });

  it("does not let a mistyped warranty quietly become 'no warranty'", async () => {
    const result = await createProductAction(undefined, form({ ...base, warrantyDays: "ninety" }));
    expect(result).toMatchObject({ fieldErrors: { warrantyDays: expect.any(String) } });
    expect(callsTo("product.create")).toHaveLength(0);
  });

  it.each([
    ["", null],
    ["0", null],
    ["365", 365],
  ])("stores warranty %j as %j", async (warrantyDays, stored) => {
    handlers["product.findFirst"] = () => null;
    handlers["product.findMany"] = () => [];
    handlers["product.create"] = () => ({ id: "prod_1", sku: "SCRE-1000", stockQty: 0 });

    await expect(
      createProductAction(undefined, form({ ...base, sku: "S-1", warrantyDays })),
    ).rejects.toThrow("REDIRECT:");
    expect(dataOf("product.create").warrantyDays).toBe(stored);
  });

  it("applies the same plain message when editing, before anything is written", async () => {
    handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 0, serialized: false, sku: "S-1" });

    const result = await updateProductAction(
      undefined,
      form({ id: "prod_1", ...base, lowStockAt: "soon" }),
    );
    expect(result).toMatchObject({
      fieldErrors: { lowStockAt: "The reorder point must be a whole number, like 5." },
    });
    expectNoWrites();
  });
});

describe("quick add quantity", () => {
  it.each(["abc", "2.5"])("shows a plain message under the quantity box for %j", async (stockQty) => {
    const result = await quickAddProductAction(undefined, form({ name: "Screen", price: "10", stockQty }));

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { stockQty: "Stock must be a whole number, like 5." },
    });
    expect(callsTo("product.findMany")).toHaveLength(0);
    expectNoWrites();
  });
});
