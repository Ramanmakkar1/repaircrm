import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSpreadsheet } from "@/lib/spreadsheet-import";
import { readInt, readMoney } from "@/components/import/fields";
import { parseMappingSuggestion } from "@/lib/ai/import-mapping";
import { matchesCustomer, contactFromQuery } from "@/lib/customers/search-options";

function workbook(bookType: XLSX.BookType) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Read me"], ["This is an inventory export"]]), "Instructions");
  const sheet = XLSX.utils.aoa_to_sheet([["October parts"], [], ["Item", "SKU", "Barcode", "Price", "Qty"], ["Screen, OLED", "000123", "0012345678901", 99.5, 6]]);
  sheet.D4.z = '$0.00';
  XLSX.utils.book_append_sheet(book, sheet, "Parts");
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType }));
}

describe("spreadsheet import", () => {
  it.each(["xlsx", "xls", "ods"] as const)("reads %s, selects a sheet, detects title rows, and preserves identifiers", (format) => {
    const table = readSpreadsheet(workbook(format), `parts.${format}`, "products", { sheetName: "Parts" });
    expect(table.sheets).toEqual(["Instructions", "Parts"]);
    expect(table.headerRow).toBe(3);
    expect(table.headers).toEqual(["Item", "SKU", "Barcode", "Price", "Qty"]);
    expect(table.rows[0].slice(0, 3)).toEqual(["Screen, OLED", "000123", "0012345678901"]);
    expect(readMoney(table.rows[0][3])).toBe(9950);
  });
  it("accepts Google Sheets tab-separated paste with quoted multiline cells", () => {
    const bytes = new TextEncoder().encode('Item\tSKU\tQty\n"OLED\nScreen"\t0001\t6\n');
    expect(readSpreadsheet(bytes, "paste.tsv", "products").rows).toEqual([["OLED\nScreen", "0001", "6"]]);
  });
  it("reads CSV with quoted commas and a manual header row", () => {
    const bytes = new TextEncoder().encode('Parts export\nItem,SKU,Price\n"Screen, OLED",001,99.50');
    const table = readSpreadsheet(bytes, "parts.csv", "products", { headerRow: 2 });
    expect(table.headerRow).toBe(2);
    expect(table.rows).toEqual([["Screen, OLED", "001", "99.50"]]);
  });
  it("rejects excess rows instead of silently dropping inventory", () => {
    const text = "Item,SKU\n" + Array.from({ length: 5001 }, (_, i) => `Part ${i},P${i}`).join("\n");
    expect(() => readSpreadsheet(new TextEncoder().encode(text), "parts.csv", "products")).toThrow("5,000");
  });
  it("rejects an absent worksheet and an invalid header selection", () => {
    expect(() => readSpreadsheet(workbook("xlsx"), "parts.xlsx", "products", { sheetName: "Missing" })).toThrow("worksheet");
    expect(() => readSpreadsheet(workbook("xlsx"), "parts.xlsx", "products", { sheetName: "Parts", headerRow: 0 })).toThrow("header row");
  });
});

describe("inventory numeric values", () => {
  it("never turns fractional quantities into a larger whole number", () => {
    expect(readInt("12.5")).toBeNaN();
    expect(readInt("12,5")).toBeNaN();
    expect(readInt("12 units")).toBe(12);
    expect(readInt("1,250")).toBe(1250);
  });
  it("preserves currency cents and flags ambiguous decimal separators", () => {
    expect(readMoney("$1,299.00")).toBe(129900);
    expect(readMoney("12,50")).toBeNaN();
    expect(readMoney("1.299,00")).toBeNaN();
    expect(readMoney("12.345")).toBeNaN();
    expect(readMoney("not a price")).toBeNaN();
    expect(readMoney("")).toBeNull();
  });
});

describe("AI sheet mapping", () => {
  it("allows a useful reviewed suggestion", () => {
    expect(parseMappingSuggestion('{"mapping":{"name":0,"sku":1,"stockQty":2},"notes":["Price column missing"]}', 3)).toMatchObject({ mapping: { name: 0, sku: 1, stockQty: 2 } });
  });
  it.each([
    '{"mapping":{"name":99},"notes":[]}',
    '{"mapping":{"name":0,"sku":0},"notes":[]}',
    '{"mapping":{"shopId":0},"notes":[]}',
    '{"mapping":{"name":0.5},"notes":[]}',
  ])("refuses invented or conflicting column mappings", (text) => {
    expect(parseMappingSuggestion(text, 3)).toBeNull();
  });
});

describe("counter customer reuse", () => {
  const customer = { id: "c1", label: "Sam Lee", mobile: "(780) 555-0142", email: "sam@example.com" };
  it("finds a saved contact without requiring matching phone punctuation", () => {
    expect(matchesCustomer(customer, "7805550142")).toBe(true);
    expect(matchesCustomer(customer, "5550142")).toBe(true);
    expect(matchesCustomer(customer, "sam lee")).toBe(true);
    expect(matchesCustomer(customer, "sam@example")).toBe(true);
    expect(matchesCustomer(customer, "9999")).toBe(false);
  });
  it("reuses a typed phone or email in the new customer fields", () => {
    expect(contactFromQuery("7805550142")).toEqual({ name: "", phone: "7805550142", email: "" });
    expect(contactFromQuery("sam@example.com")).toEqual({ name: "", phone: "", email: "sam@example.com" });
  });
});
