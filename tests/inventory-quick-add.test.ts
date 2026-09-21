import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

/** The unique-constraint rejection Prisma raises, which the action catches. */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

/**
 * Auto-SKU and the Quick Add create path.
 *
 * The behaviour worth protecting is not "Postgres stores a row" — it is that a
 * blank SKU gets MINTED (the client's complaint: nothing auto-generated), that a
 * minted number is derived per shop+prefix and retried on a race, and that Quick
 * Add applies the right column defaults (taxable/active on) and writes an opening
 * stock adjustment. All of that is decidable from the arguments the code hands
 * Prisma, which the db-mock records.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The full form redirects on success; a sentinel throw lets the test observe it
// (redirect() throws by design) without pulling in the router.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const session = {
  shopId: "shop_1",
  userId: "user_1",
  role: "OWNER",
  name: "Ada Lovelace",
};
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const { skuPrefix, nextSku } = await import("@/lib/inventory/sku");
const { quickAddProductAction, createProductAction, updateProductAction } = await import(
  "@/app/(app)/inventory/actions"
);

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** The create returns the id/sku/stock the action selected back. */
function stubCreate(): void {
  handlers["product.create"] = (args) => {
    const data = (args.data ?? {}) as { sku?: string; stockQty?: number };
    return { id: "prod_1", sku: data.sku, stockQty: data.stockQty ?? 0 };
  };
  handlers["stockAdjustment.create"] = () => ({ id: "adj_1" });
}

async function tx() {
  const { fakeClient } = await import("./helpers/db-mock");
  return fakeClient as unknown as Parameters<typeof nextSku>[0];
}

beforeEach(() => {
  resetDb();
});

describe("skuPrefix", () => {
  it("prefers the category, since that is how a shop groups stock", () => {
    expect(skuPrefix("iPhone 6 Screen", "Screens")).toBe("SCRE");
  });

  it("falls back to the name, letters and digits only, capped at four", () => {
    expect(skuPrefix("iPhone 6 Screen", null)).toBe("IPHO");
    expect(skuPrefix("iPhone 6 Screen")).toBe("IPHO");
  });

  it("falls back to SKU when there is nothing usable", () => {
    expect(skuPrefix("!!!", null)).toBe("SKU");
    expect(skuPrefix("", "")).toBe("SKU");
  });
});

describe("nextSku", () => {
  it("starts a fresh prefix at 1000", async () => {
    handlers["product.findMany"] = () => [];
    expect(await nextSku(await tx(), "shop_1", "iPhone 6 Screen", null)).toBe(
      "IPHO-1000",
    );
  });

  it("continues past the highest number, ignoring non-numeric suffixes", async () => {
    handlers["product.findMany"] = () => [
      { sku: "IPHO-1000" },
      { sku: "IPHO-1004" },
      { sku: "IPHO-A1" },
    ];
    expect(await nextSku(await tx(), "shop_1", "iPhone 6 Screen", null)).toBe(
      "IPHO-1005",
    );
  });

  it("scopes the search to this shop and this prefix", async () => {
    handlers["product.findMany"] = () => [];
    await nextSku(await tx(), "shop_1", "Screens", "Screens");
    expect(whereOf("product.findMany")).toEqual({
      shopId: "shop_1",
      sku: { startsWith: "SCRE-" },
    });
  });
});

describe("quickAddProductAction", () => {
  it("mints a SKU, defaults taxable/active on, and records opening stock", async () => {
    handlers["product.findMany"] = () => [];
    stubCreate();

    const result = await quickAddProductAction(
      undefined,
      form({ name: "iPhone 6 Screen", price: "40", stockQty: "10", category: "" }),
    );

    expect(result).toEqual({
      ok: true,
      productId: "prod_1",
      name: "iPhone 6 Screen",
      sku: "IPHO-1000",
    });

    expect(dataOf("product.create")).toMatchObject({
      shopId: "shop_1",
      name: "iPhone 6 Screen",
      sku: "IPHO-1000",
      priceCents: 4000,
      stockQty: 10,
      taxable: true,
      active: true,
      serialized: false,
      costCents: null,
      category: null,
    });

    expect(dataOf("stockAdjustment.create")).toMatchObject({
      shopId: "shop_1",
      productId: "prod_1",
      delta: 10,
      reason: "Initial stock",
      userId: "user_1",
    });
  });

  it("writes no opening-stock adjustment when quantity is blank", async () => {
    handlers["product.findMany"] = () => [];
    stubCreate();

    const result = await quickAddProductAction(
      undefined,
      form({ name: "Cleaning service", price: "0" }),
    );

    expect(result).toMatchObject({ ok: true });
    expect(callsTo("stockAdjustment.create")).toHaveLength(0);
  });

  it("rejects a blank name with a field error and never touches the db", async () => {
    const result = await quickAddProductAction(
      undefined,
      form({ name: "", price: "10" }),
    );

    expect(result).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(callsTo("product.create")).toHaveLength(0);
  });

  it("retries with a fresh number when a minted SKU loses a race", async () => {
    handlers["product.findMany"] = () => [];
    let firstTry = true;
    handlers["product.create"] = (args) => {
      const data = (args.data ?? {}) as { sku?: string; stockQty?: number };
      if (firstTry) {
        firstTry = false;
        throw uniqueViolation();
      }
      return { id: "prod_2", sku: data.sku, stockQty: data.stockQty ?? 0 };
    };
    handlers["stockAdjustment.create"] = () => ({});

    const result = await quickAddProductAction(
      undefined,
      form({ name: "iPhone 6 Screen", price: "5", stockQty: "1" }),
    );

    expect(result).toMatchObject({ ok: true, productId: "prod_2" });
    expect(callsTo("product.create")).toHaveLength(2);
  });
});

describe("createProductAction (full form)", () => {
  it("auto-generates a SKU when the field is left blank", async () => {
    handlers["product.findMany"] = () => [];
    stubCreate();

    await expect(
      createProductAction(
        undefined,
        form({ name: "iPhone 6 Screen", price: "40", stockQty: "3" }),
      ),
    ).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=created");

    expect(dataOf("product.create")).toMatchObject({ sku: "IPHO-1000" });
  });

  it("keeps and uppercases a SKU the user typed", async () => {
    handlers["product.findFirst"] = () => null; // not taken
    stubCreate();

    await expect(
      createProductAction(undefined, form({ name: "X", price: "1", sku: "scr-ip14" })),
    ).rejects.toThrow("REDIRECT:");

    expect(dataOf("product.create")).toMatchObject({ sku: "SCR-IP14" });
  });

  it("returns a field error when the typed SKU is already taken", async () => {
    handlers["product.findFirst"] = () => ({ id: "other" }); // taken

    const result = await createProductAction(
      undefined,
      form({ name: "X", price: "1", sku: "ABC" }),
    );

    expect(result).toMatchObject({ fieldErrors: { sku: expect.any(String) } });
    expect(callsTo("product.create")).toHaveLength(0);
  });
});

describe("SKU stability when editing", () => {
  it("keeps the existing barcode when the submitted SKU is blank", async () => {
    handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 0, serialized: false, sku: "IPHO-1000" });
    handlers["product.update"] = () => ({ id: "prod_1" });
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Renamed screen", price: "40", sku: "" }))).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=updated");
    expect(dataOf("product.update").sku).toBe("IPHO-1000");
    expect(callsTo("product.findMany")).toHaveLength(0);
  });

  it("generates a barcode for a legacy product without a SKU", async () => {
    handlers["product.findFirst"] = () => ({ id: "prod_1", stockQty: 0, serialized: false, sku: null });
    handlers["product.findMany"] = () => [];
    handlers["product.update"] = () => ({ id: "prod_1" });
    await expect(updateProductAction(undefined, form({ id: "prod_1", name: "Screen", price: "40" }))).rejects.toThrow("REDIRECT:/inventory/prod_1?flash=updated");
    expect(dataOf("product.update").sku).toBe("SCRE-1000");
  });
});
