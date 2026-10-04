import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * The picture a product was given on purpose ("catalogImage") on the way into and out of the database.
 * What matters: a real catalog key is stored, an unknown one quietly becomes "automatic" (null, never an
 * error on screen), an update that does not carry the field never wipes a chosen picture, and every
 * query still carries the signed-in shop.
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

const { createProductAction, quickAddProductAction, updateProductAction } = await import("@/app/(app)/inventory/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function stubCreate(): void {
  handlers["product.findMany"] = () => [];
  handlers["product.create"] = (args) => {
    const data = (args.data ?? {}) as { sku?: string; stockQty?: number };
    return { id: "prod_1", sku: data.sku, stockQty: data.stockQty ?? 0 };
  };
  handlers["stockAdjustment.create"] = () => ({ id: "adj_1" });
}

function stubOwnedProduct(): void {
  handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 4, serialized: false, sku: "GLAS-1000" });
  handlers["product.update"] = () => ({ id: "prod_1" });
}

beforeEach(() => {
  resetDb();
});

describe("create with a chosen picture", () => {
  it("stores a valid key from the full form", async () => {
    stubCreate();
    await expect(
      createProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "screen-protector" })),
    ).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=created");
    expect(dataOf("product.create")).toMatchObject({ catalogImage: "screen-protector" });
  });

  it("stores a valid key from Quick Add", async () => {
    stubCreate();
    const result = await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "screen-protector" }));
    expect(result).toMatchObject({ ok: true });
    expect(dataOf("product.create")).toMatchObject({ catalogImage: "screen-protector" });
  });

  it("trims a padded key", async () => {
    stubCreate();
    await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "  screen-protector " }));
    expect(dataOf("product.create")).toMatchObject({ catalogImage: "screen-protector" });
  });

  it("stores null (automatic) for a key that is not in the catalog, without an error", async () => {
    stubCreate();
    const quick = await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "no-such-picture" }));
    expect(quick).toMatchObject({ ok: true });
    expect(dataOf("product.create")).toMatchObject({ catalogImage: null });

    resetDb();
    stubCreate();
    await expect(
      createProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "<script>" })),
    ).rejects.toThrow("REDIRECT:");
    expect(dataOf("product.create")).toMatchObject({ catalogImage: null });
  });

  it("stores null when the field is empty or left out", async () => {
    stubCreate();
    await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9", catalogImage: "" }));
    expect(dataOf("product.create")).toMatchObject({ catalogImage: null });

    resetDb();
    stubCreate();
    await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9" }));
    expect(dataOf("product.create")).toMatchObject({ catalogImage: null });
  });

  it("does not change what else is saved, and stays on the signed-in shop", async () => {
    stubCreate();
    await quickAddProductAction(undefined, form({ name: "Glass guard", price: "9", stockQty: "3", category: "Screens", catalogImage: "screen-protector" }));
    expect(dataOf("product.create")).toMatchObject({ shopId: "shop_1", name: "Glass guard", category: "Screens", priceCents: 900, stockQty: 3 });
    expect(dataOf("stockAdjustment.create")).toMatchObject({ shopId: "shop_1", delta: 3 });
  });
});

describe("update with a chosen picture", () => {
  it("leaves the stored picture alone when the form does not carry the field", async () => {
    stubOwnedProduct();
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Glass guard", price: "9" }))).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=updated");
    expect(Object.keys(dataOf("product.update"))).not.toContain("catalogImage");
  });

  it("clears the picture (back to automatic) when the field is empty", async () => {
    stubOwnedProduct();
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Glass guard", price: "9", catalogImage: "" }))).rejects.toThrow("REDIRECT:");
    expect(dataOf("product.update")).toHaveProperty("catalogImage", null);
  });

  it("changes the picture when the field carries a valid key", async () => {
    stubOwnedProduct();
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Glass guard", price: "9", catalogImage: "wall-charger" }))).rejects.toThrow("REDIRECT:");
    expect(dataOf("product.update")).toHaveProperty("catalogImage", "wall-charger");
  });

  it("treats an unknown key as automatic rather than failing the save", async () => {
    stubOwnedProduct();
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Glass guard", price: "9", catalogImage: "made-up" }))).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=updated");
    expect(dataOf("product.update")).toHaveProperty("catalogImage", null);
  });

  it("only ever touches a product the signed-in shop owns", async () => {
    handlers["product.findFirst"] = () => null; // somebody else's id
    handlers["product.update"] = () => ({ id: "foreign" });
    const result = await updateProductAction(undefined, form({ id: "foreign", name: "Glass guard", price: "9", catalogImage: "wall-charger" }));
    expect(result).toEqual({ error: "Product not found." });
    expect(whereOf("product.findFirst")).toMatchObject({ id: "foreign", shopId: "shop_1" });
    expect(callsTo("product.update")).toHaveLength(0);
  });
});
