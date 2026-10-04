import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/comms/config", () => ({ appOrigin: (url: string) => new URL(url).origin }));
const auth = vi.hoisted(() => ({ session: { shopId: "shop_a", userId: "user_a", pv: 0 } as { shopId: string; userId: string; pv: number } | null }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => auth.session), passwordVersion: (date: Date | null) => date ? Math.floor(date.getTime() / 1000) : 0 }));
const service = vi.hoisted(() => ({ getAutomaticProductPhoto: vi.fn(), dismissAutomaticProductPhoto: vi.fn() }));
vi.mock("@/lib/inventory/automatic-product-photos", async (original) => ({ ...await original(), ...service }));
const storage = vi.hoisted(() => ({ readUpload: vi.fn() }));
vi.mock("@/lib/storage", () => storage);
import { DELETE, POST } from "@/app/(app)/inventory/[id]/photo/automatic/route";
import { GET } from "@/app/(app)/inventory/[id]/photo/automatic/image/route";
import { automaticPhotoLookupKey } from "@/lib/inventory/automatic-product-photos";

const ctx = { params: Promise.resolve({ id: "product_a" }) };
const result = { ok: true, status: "ready", imageUrl: "/inventory/product_a/photo/automatic/image", attribution: { title: "Zebra ZD220 barcode scanner.png", author: "Creator", sourceUrl: "https://commons.wikimedia.org/wiki/File:ThinkPad.png", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" } };
const imageProduct = () => ({ name: "Zebra ZD220 barcode scanner", category: "Computers", attachments: [], automaticPhoto: { shopId: "shop_a", status: "ready", lookupKey: automaticPhotoLookupKey("Zebra ZD220 barcode scanner"), path: "shop_a/photo.png", storage: "s3", mimeType: "image/png" } });
function request(method = "POST", headers: HeadersInit = {}) { return new Request("http://localhost:3020/inventory/product_a/photo/automatic", { method, headers }); }

beforeEach(() => {
  resetDb(); vi.clearAllMocks(); auth.session = { shopId: "shop_a", userId: "user_a", pv: 0 };
  handlers["user.findFirst"] = () => ({ active: true, mustChangePassword: false, passwordChangedAt: null });
  handlers["product.findFirst"] = imageProduct;
  service.getAutomaticProductPhoto.mockResolvedValue(result);
  service.dismissAutomaticProductPhoto.mockResolvedValue({ ok: true, status: "no_match", imageUrl: null, attribution: null });
  storage.readUpload.mockResolvedValue({ body: new Uint8Array([137, 80, 78, 71]), sizeBytes: 4 });
});

describe("automatic photo endpoint authorization", () => {
  it("uses the session tenant and ignores supplied arbitrary URLs or queries", async () => {
    const response = await POST(new Request("http://localhost:3020/inventory/product_a/photo/automatic", { method: "POST", body: JSON.stringify({ shopId: "shop_other", query: "customer@example.com", url: "http://127.0.0.1/.env" }) }), ctx);
    expect(await response.json()).toEqual(result);
    expect(whereOf("product.findFirst")).toEqual({ id: "product_a", shopId: "shop_a" });
    expect(service.getAutomaticProductPhoto).toHaveBeenCalledExactlyOnceWith("product_a", auth.session);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([POST, DELETE])("refuses another shop's product before any cache mutation", async (handler) => {
    handlers["product.findFirst"] = () => null;
    expect((await handler(request(handler === POST ? "POST" : "DELETE"), ctx))?.status).toBe(404);
    expect(service.getAutomaticProductPhoto).not.toHaveBeenCalled();
    expect(service.dismissAutomaticProductPhoto).not.toHaveBeenCalled();
  });

  it.each(["inactive", "password", "forced"])("refuses a %s live account even with a valid cookie", async (state) => {
    handlers["user.findFirst"] = () => ({ active: state !== "inactive", mustChangePassword: state === "forced", passwordChangedAt: state === "password" ? new Date(10000) : null });
    expect((await POST(request(), ctx))?.status).toBe(401);
    expect(callsTo("product.findFirst")).toHaveLength(0);
    expect(service.getAutomaticProductPhoto).not.toHaveBeenCalled();
  });

  it("rejects cross-site mutation before checking product ownership", async () => {
    expect((await POST(request("POST", { origin: "https://attacker.example" }), ctx))?.status).toBe(403);
    expect(callsTo("user.findFirst")).toHaveLength(0);
    expect(callsTo("product.findFirst")).toHaveLength(0);
  });

  it("allows staff to dismiss an automatic image without deleting manual photo rows", async () => {
    expect((await DELETE(request("DELETE"), ctx))?.status).toBe(200);
    expect(service.dismissAutomaticProductPhoto).toHaveBeenCalledExactlyOnceWith("product_a", "shop_a");
    expect(callsTo("attachment.deleteMany")).toHaveLength(0);
  });
});

describe("private cached image delivery", () => {
  it("serves stored raster bytes only after current account and tenant checks", async () => {
    const response = await GET(request("GET"), ctx);
    expect(response.status).toBe(200);
    expect(whereOf("product.findFirst")).toMatchObject({ id: "product_a", shopId: "shop_a" });
    expect(storage.readUpload).toHaveBeenCalledExactlyOnceWith("s3", "shop_a/photo.png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it.each(["signed_out", "other_shop", "renamed", "uploaded", "unsafe_type"])("returns 404 without storage access for %s", async (caseName) => {
    if (caseName === "signed_out") auth.session = null;
    handlers["product.findFirst"] = () => {
      if (caseName === "other_shop") return null;
      const product = imageProduct();
      if (caseName === "renamed") product.name = "Zebra ZD230 barcode scanner";
      if (caseName === "uploaded") (product.attachments as Array<{ id: string }>).push({ id: "manual_photo" });
      if (caseName === "unsafe_type") product.automaticPhoto.mimeType = "text/html";
      return product;
    };
    expect((await GET(request("GET"), ctx)).status).toBe(404);
    expect(storage.readUpload).not.toHaveBeenCalled();
  });
});
