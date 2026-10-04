import type { AutomaticProductPhoto } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";
import { clearRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/auth", () => ({ passwordVersion: (date: Date | null) => date ? Math.floor(date.getTime() / 1000) : 0 }));
const external = vi.hoisted(() => ({ searchCommonsPhoto: vi.fn() }));
vi.mock("@/lib/inventory/commons-photos", async (original) => ({ ...await original(), searchCommonsPhoto: external.searchCommonsPhoto }));
const storage = vi.hoisted(() => ({ storeUpload: vi.fn(), removeUpload: vi.fn() }));
vi.mock("@/lib/storage", () => storage);
import { automaticPhotoCachedResult, automaticPhotoLookupKey, dismissAutomaticProductPhoto, getAutomaticProductPhoto } from "@/lib/inventory/automatic-product-photos";

const session = { shopId: "shop_auto", userId: "user_a", pv: 0 };
const credit = { title: "Zebra ZD220 barcode scanner.png", author: "Creator", sourceUrl: "https://commons.wikimedia.org/wiki/File:ThinkPad_T420.png", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" };
const upload = { path: "shop_auto/new.png", storage: "s3", fileName: "licensed-product-photo.png", mimeType: "image/png", sizeBytes: 16 };
let row: AutomaticProductPhoto | null;
let name: string;
let attachmentIds: string[];
function cached(overrides: Partial<AutomaticProductPhoto> = {}): AutomaticProductPhoto {
  return { id: "auto_photo", productId: "product_a", shopId: session.shopId, lookupKey: automaticPhotoLookupKey("Zebra ZD220 barcode scanner"), status: "ready", searchedAt: new Date(), nextAttemptAt: new Date("2100-01-01"), leaseToken: null, storage: "s3", path: "shop_auto/old.png", mimeType: "image/png", sizeBytes: 16, ...credit, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}
beforeEach(() => {
  resetDb(); vi.clearAllMocks(); clearRateLimit(`automatic-photo:${session.shopId}`);
  row = null; name = "Zebra ZD220 barcode scanner"; attachmentIds = [];
  handlers["$queryRaw"] = () => [];
  handlers["product.findFirst"] = () => ({ id: "product_a", name, category: "Computers", attachments: attachmentIds.map((id) => ({ id })), automaticPhoto: row });
  handlers["user.findFirst"] = () => ({ active: true, mustChangePassword: false, passwordChangedAt: null });
  handlers["automaticProductPhoto.count"] = () => 0;
  handlers["automaticProductPhoto.upsert"] = (args) => {
    const data = (row ? args.update : args.create) as Partial<AutomaticProductPhoto>;
    row = cached({ path: null, storage: null, title: null, author: null, sourceUrl: null, license: null, licenseUrl: null, ...row, ...data }); return row;
  };
  handlers["automaticProductPhoto.updateMany"] = (args) => {
    const where = args.where as Partial<AutomaticProductPhoto>;
    if (!row || (where.leaseToken !== undefined && row.leaseToken !== where.leaseToken) || (where.status !== undefined && row.status !== where.status)) return { count: 0 };
    row = { ...row, ...args.data as Partial<AutomaticProductPhoto> }; return { count: 1 };
  };
  external.searchCommonsPhoto.mockResolvedValue({ file: new File(["photo"], "photo.png", { type: "image/png" }), attribution: credit });
  storage.storeUpload.mockResolvedValue({ ok: true, upload });
  storage.removeUpload.mockResolvedValue(undefined);
});

describe("automatic catalogue photos and persistent cache", () => {
  it("stores a verified fallback with credit, then serves cached metadata without a second internet request", async () => {
    const first = await getAutomaticProductPhoto("product_a", session);
    expect(first).toEqual({ ok: true, status: "ready", imageUrl: "/inventory/product_a/photo/automatic/image", attribution: credit });
    expect(storage.storeUpload).toHaveBeenCalledWith(session.shopId, expect.any(File));
    expect(whereOf("product.findFirst")).toMatchObject({ id: "product_a", shopId: session.shopId });
    expect(whereOf("automaticProductPhoto.count")).toMatchObject({ shopId: session.shopId });
    expect(dataOf("automaticProductPhoto.updateMany")).toMatchObject({ status: "ready", storage: "s3", path: upload.path, ...credit });
    expect(dataOf("automaticProductPhoto.updateMany")).not.toHaveProperty("fileName");
    expect(await getAutomaticProductPhoto("product_a", session)).toEqual(first);
    expect(external.searchCommonsPhoto).toHaveBeenCalledTimes(1);
    expect(callsTo("automaticProductPhoto.upsert")).toHaveLength(1);
  });

  it("gives uploaded exact photos and local category illustrations priority without contacting the internet", async () => {
    attachmentIds = ["uploaded_photo"];
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "skipped", imageUrl: "/files/uploaded_photo" });
    attachmentIds = []; name = "Tempered screen protector";
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "skipped", imageUrl: "/images/products/screen-protector.webp" });
    expect(external.searchCommonsPhoto).not.toHaveBeenCalled();
    expect(storage.storeUpload).not.toHaveBeenCalled();
  });

  it("persists misses for seven days and provider errors for six hours", async () => {
    external.searchCommonsPhoto.mockResolvedValueOnce(null);
    const before = Date.now();
    const missing = await getAutomaticProductPhoto("product_a", session);
    expect(missing.status).toBe("no_match");
    expect(new Date(missing.retryAt!).getTime() - before).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(await getAutomaticProductPhoto("product_a", session)).toEqual(missing);
    expect(external.searchCommonsPhoto).toHaveBeenCalledTimes(1);
    row = null; external.searchCommonsPhoto.mockRejectedValueOnce(new Error("Timeout"));
    const failed = await getAutomaticProductPhoto("product_a", session);
    expect(failed.status).toBe("unavailable");
    expect(new Date(failed.retryAt!).getTime() - before).toBeGreaterThan(5 * 60 * 60 * 1000);
    expect(await getAutomaticProductPhoto("product_a", session)).toEqual(failed);
    expect(storage.storeUpload).not.toHaveBeenCalled();
  });

  it("honors another process's pending lease and the tenant's persistent hourly limit", async () => {
    row = cached({ status: "pending", nextAttemptAt: new Date(Date.now() + 60_000), path: null });
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "pending" });
    row = null; handlers["automaticProductPhoto.count"] = () => 20;
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "unavailable" });
    expect(external.searchCommonsPhoto).not.toHaveBeenCalled();
    expect(callsTo("automaticProductPhoto.upsert")).toHaveLength(0);
  });

  it("shares concurrent requests for the same product instead of making duplicate searches", async () => {
    let resolveSearch!: (value: null) => void;
    external.searchCommonsPhoto.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const first = getAutomaticProductPhoto("product_a", session);
    const second = getAutomaticProductPhoto("product_a", session);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(external.searchCommonsPhoto).toHaveBeenCalledTimes(1));
    resolveSearch(null);
    expect(await first).toEqual(await second);
  });

  it.each(["upload", "disabled", "renamed"])("rechecks %s after downloading and discards bytes if priority or authorization changed", async (change) => {
    external.searchCommonsPhoto.mockImplementationOnce(async () => {
      if (change === "upload") attachmentIds = ["manual_photo"];
      if (change === "disabled") handlers["user.findFirst"] = () => ({ active: false, mustChangePassword: false, passwordChangedAt: null });
      if (change === "renamed") name = "Zebra ZD230 barcode scanner";
      return { file: new File(["photo"], "photo.png", { type: "image/png" }), attribution: credit };
    });
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "skipped", imageUrl: null });
    expect(storage.removeUpload).toHaveBeenCalledWith(upload.storage, upload.path);
    expect(callsTo("automaticProductPhoto.updateMany").some((call) => (call.args.data as { status: string }).status === "ready")).toBe(false);
  });

  it("invalidates a renamed product's cached image and removes its retired bytes after replacement", async () => {
    row = cached(); name = "Zebra ZD230 barcode scanner";
    expect(automaticPhotoCachedResult(row, "product_a", automaticPhotoLookupKey(name))).toBeNull();
    expect((await getAutomaticProductPhoto("product_a", session)).status).toBe("ready");
    expect(storage.removeUpload).toHaveBeenCalledExactlyOnceWith("s3", "shop_auto/old.png");
  });

  it("handles a storage refusal with a persistent backoff and no ready image", async () => {
    storage.storeUpload.mockResolvedValueOnce({ ok: false, reason: "Quota reached" });
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "unavailable", imageUrl: null });
    expect(row?.status).toBe("unavailable");
  });

  it("dismisses an unsuitable photo, removes bytes, and prevents repeat lookup for the same name", async () => {
    row = cached();
    expect(await dismissAutomaticProductPhoto("product_a", session.shopId)).toMatchObject({ status: "no_match", imageUrl: null });
    expect(row?.status).toBe("disabled");
    expect(row?.path).toBeNull();
    expect(storage.removeUpload).toHaveBeenCalledExactlyOnceWith("s3", "shop_auto/old.png");
    expect(await getAutomaticProductPhoto("product_a", session)).toMatchObject({ status: "no_match", imageUrl: null });
    expect(external.searchCommonsPhoto).not.toHaveBeenCalled();
  });
});
