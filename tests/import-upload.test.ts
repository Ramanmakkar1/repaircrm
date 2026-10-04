import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { clearRateLimit } from "@/lib/rate-limit";
import { declaredUnzippedBytes, readSpreadsheet } from "@/lib/spreadsheet-import";

/**
 * The upload endpoint (components/import/upload.ts) and the workbook reader it
 * calls (lib/spreadsheet-import.ts).
 *
 * Two things protect the server from a file that is small on the wire and huge
 * once opened: a per-person rate limit on uploads, and bounds on what reading
 * a workbook may materialise. The 5,000-row cap was only tested for CSV; an
 * XLSX takes a different path (SheetJS), so it is pinned here too.
 */

const auth = vi.hoisted(() => ({
  session: { shopId: "shop_1", userId: "user_1", role: "OWNER" } as
    | { shopId: string; userId: string; role: string }
    | null,
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => auth.session) }));
const store = vi.hoisted(() => ({ saveImportBatch: vi.fn(async () => "b".repeat(32)) }));
vi.mock("@/lib/import-store", () => store);

const { handleImportUpload } = await import("@/components/import/upload");

function xlsxBytes(rows: (string | number)[][]): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Parts");
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

const partsSheet = (dataRows: number) => [
  ["Item", "SKU", "Price"],
  ...Array.from({ length: dataRows }, (_, index) => [`Part ${index}`, `SKU-${index}`, 9.5]),
];

describe("workbook row cap (XLSX, not only CSV)", () => {
  it("accepts exactly 5,000 data rows", () => {
    const table = readSpreadsheet(xlsxBytes(partsSheet(5000)), "parts.xlsx", "products");
    expect(table.rows).toHaveLength(5000);
    expect(table.headers).toEqual(["Item", "SKU", "Price"]);
  });

  it("refuses 5,001 data rows instead of silently dropping the last one", () => {
    expect(() => readSpreadsheet(xlsxBytes(partsSheet(5001)), "parts.xlsx", "products")).toThrow("5,000");
  });

  it("refuses a sheet whose declared size is far past the cap before reading its rows", () => {
    expect(() => readSpreadsheet(xlsxBytes(partsSheet(6500)), "parts.xlsx", "products")).toThrow("5,000 data rows");
  });

  it("refuses more than 100 columns in a workbook", () => {
    const wide = [Array.from({ length: 101 }, (_, index) => `Column ${index}`), Array.from({ length: 101 }, (_, index) => index)];
    expect(() => readSpreadsheet(xlsxBytes(wide), "wide.xlsx", "products")).toThrow("100 columns");
  });
});

describe("workbook unpacked-size guard", () => {
  /** Rewrites what the first file in the zip says it will unpack to. */
  function claimUnpackedSize(bytes: Uint8Array, size: number): Uint8Array {
    const copy = new Uint8Array(bytes);
    const at = Buffer.from(copy).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(at).toBeGreaterThan(0);
    new DataView(copy.buffer).setUint32(at + 24, size, true);
    return copy;
  }

  it("reads the size a zip declares from its table of contents, and 0 for a CSV", () => {
    const bytes = xlsxBytes(partsSheet(3));
    const declared = declaredUnzippedBytes(bytes);
    expect(declared).toBeGreaterThan(0);
    expect(declared).toBeLessThan(1024 * 1024);
    expect(declaredUnzippedBytes(new TextEncoder().encode("Item,SKU\nA,1"))).toBe(0);
  });

  it("refuses a workbook that claims to unpack to far more than a 5 MB upload should", () => {
    const bomb = claimUnpackedSize(xlsxBytes(partsSheet(3)), 900 * 1024 * 1024);
    expect(declaredUnzippedBytes(bomb)).toBeGreaterThan(50 * 1024 * 1024);
    expect(() => readSpreadsheet(bomb, "parts.xlsx", "products")).toThrow("far more data");
  });

  it("does not apply to a CSV, however it is named", () => {
    const table = readSpreadsheet(new TextEncoder().encode("Item,SKU\nA,1"), "parts.csv", "products");
    expect(table.rows).toEqual([["A", "1"]]);
  });
});

function uploadRequest(file = new File(["Item,SKU\nScreen,S-1"], "parts.csv", { type: "text/csv" })) {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost:3020/inventory/import/upload", { method: "POST", body: form });
}

describe("upload rate limit", () => {
  beforeEach(() => {
    auth.session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };
    store.saveImportBatch.mockClear();
    for (const user of ["user_1", "user_2"]) clearRateLimit(`import-upload:shop_1:${user}`);
  });

  it("lets a normal session through", async () => {
    const response = await handleImportUpload(uploadRequest(), "products", ["OWNER"]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rowCount: 1 });
  });

  it("refuses a loop of uploads in plain words, before reading the body or saving anything", async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      expect((await handleImportUpload(uploadRequest(), "products", ["OWNER"])).status).toBe(200);
    }
    store.saveImportBatch.mockClear();

    const refused = uploadRequest();
    const readBody = vi.spyOn(refused, "formData");
    const response = await handleImportUpload(refused, "products", ["OWNER"]);

    expect(response.status).toBe(429);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/too many|a lot of uploads/i);
    expect(body.error).toMatch(/try again in/i);
    expect(readBody).not.toHaveBeenCalled();
    expect(store.saveImportBatch).not.toHaveBeenCalled();
  });

  it("counts each person separately", async () => {
    for (let attempt = 0; attempt < 13; attempt++) await handleImportUpload(uploadRequest(), "products", ["OWNER"]);
    auth.session = { shopId: "shop_1", userId: "user_2", role: "OWNER" };

    const other = await handleImportUpload(uploadRequest(), "products", ["OWNER"]);
    expect(other.status).toBe(200);
  });

  it("does not spend the allowance for someone who is not signed in or not allowed", async () => {
    auth.session = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await handleImportUpload(uploadRequest(), "products", ["OWNER"])).status).toBe(401);
    }
    auth.session = { shopId: "shop_1", userId: "user_1", role: "TECH" };
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await handleImportUpload(uploadRequest(), "products", ["OWNER"])).status).toBe(403);
    }
    auth.session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };
    expect((await handleImportUpload(uploadRequest(), "products", ["OWNER"])).status).toBe(200);
  });
});
