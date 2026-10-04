import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, handlers, resetDb } from "./helpers/db-mock";
import { GENERATE_SKU } from "@/components/import/fields";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient };
});
const { commitImport, previewImport, sheetProductCode } = await import("@/components/import/commit");
const batch = { id: "a".repeat(32), shopId: "shop_1", kind: "products" as const, fileName: "stock.xlsx", createdAt: Date.now(), headers: ["Item", "Price", "Qty"], rows: [["Screen guard", "12.50", "3"], ["Screen guard", "12.50", "3"]], headerRow: 3 };
const mapping = { name: 0, priceCents: 1, stockQty: 2, sku: GENERATE_SKU };
beforeEach(() => {
  resetDb();
  handlers["product.findMany"] = () => [];
  handlers["stockAdjustment.create"] = () => ({ id: "adjustment_1" });
});

describe("spreadsheet commit", () => {
  it("generates repeatable codes without using price or stock as identity", () => {
    expect(sheetProductCode(" Screen guard ", "00123")).toBe(sheetProductCode("SCREEN  GUARD", "00123"));
    expect(sheetProductCode("Screen guard", "00123")).not.toBe(sheetProductCode("Screen guard", "00124"));
  });
  it("creates one product for repeated rows and records its initial quantity", async () => {
    handlers["product.create"] = () => ({ id: "guard_1" });
    const result = await commitImport("shop_1", batch, mapping, "skip");
    expect(result).toMatchObject({ created: 1, skipped: 1, errors: [] });
    expect(callsTo("product.create")[0].args.data).toMatchObject({ shopId: "shop_1", priceCents: 1250, stockQty: 3, sku: sheetProductCode("Screen guard", "") });
    expect(callsTo("stockAdjustment.create")[0].args.data).toMatchObject({ shopId: "shop_1", productId: "guard_1", delta: 3 });
  });
  it("rejects fractional quantities and reports the actual spreadsheet row", async () => {
    const preview = await previewImport("shop_1", { ...batch, rows: [["Screen guard", "12.50", "12.5"]] }, mapping);
    expect(preview).toMatchObject({ valid: 0, invalid: 1, rows: [{ row: 4 }] });
    expect(preview.rows[0].errors.join(" ")).toContain("whole number");
    expect(callsTo("product.create")).toHaveLength(0);
  });
});
