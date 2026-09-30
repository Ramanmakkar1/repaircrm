import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/comms/config", () => ({ appOrigin: (url: string) => new URL(url).origin }));
const auth = vi.hoisted(() => ({ session: { shopId: "shop_a", userId: "user_a", pv: 0 } as { shopId: string; userId: string; pv: number } | null }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => auth.session),
  passwordVersion: (date: Date | null) => date ? Math.floor(date.getTime() / 1000) : 0,
}));
const storage = vi.hoisted(() => ({ storeUpload: vi.fn(), removeUpload: vi.fn() }));
vi.mock("@/lib/storage", () => storage);
import { DELETE, POST } from "@/app/(app)/inventory/[id]/photo/route";

const ctx = { params: Promise.resolve({ id: "product_a" }) };
const oldPhoto = { id: "old_photo", storage: "s3", path: "shop_a/old.png" };
const upload = { path: "shop_a/new.png", storage: "s3", fileName: "new.png", mimeType: "image/png", sizeBytes: 16 };

function photoRequest(file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])], "new.png", { type: "image/png" })) {
  const form = new FormData(); form.set("photo", file);
  return new Request("http://localhost:3020/inventory/product_a/photo", { method: "POST", body: form });
}

beforeEach(() => {
  resetDb(); vi.clearAllMocks();
  auth.session = { shopId: "shop_a", userId: "user_a", pv: 0 };
  handlers["user.findFirst"] = () => ({ active: true, mustChangePassword: false, passwordChangedAt: null });
  handlers["product.findFirst"] = () => ({ id: "product_a" });
  handlers["attachment.findMany"] = () => [oldPhoto];
  handlers["attachment.create"] = () => ({ id: "new_photo" });
  handlers["attachment.deleteMany"] = () => ({ count: 1 });
  storage.storeUpload.mockResolvedValue({ ok: true, upload });
  storage.removeUpload.mockResolvedValue(undefined);
});

describe("product photo ownership and storage", () => {
  it("stores a replacement against the session's shop and removes only that product's former image", async () => {
    const response = await POST(photoRequest(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, imageUrl: "/files/new_photo" });
    expect(whereOf("product.findFirst")).toEqual({ id: "product_a", shopId: "shop_a" });
    expect(whereOf("attachment.findMany")).toMatchObject({ shopId: "shop_a", productId: "product_a" });
    expect(dataOf("attachment.create")).toMatchObject({ shopId: "shop_a", productId: "product_a", uploadedById: "user_a" });
    expect(whereOf("attachment.deleteMany")).toEqual({ shopId: "shop_a", productId: "product_a", id: { in: ["old_photo"] } });
    expect(storage.removeUpload).toHaveBeenCalledWith(oldPhoto.storage, oldPhoto.path);
  });

  it.each(["POST", "DELETE"])("refuses another shop's product before storage in %s", async (method) => {
    handlers["product.findFirst"] = () => null;
    const response = method === "POST" ? await POST(photoRequest(), ctx) : await DELETE(new Request("http://localhost:3020/inventory/product_a/photo", { method: "DELETE" }), ctx);
    expect(response.status).toBe(404);
    expect(storage.storeUpload).not.toHaveBeenCalled();
    expect(storage.removeUpload).not.toHaveBeenCalled();
    expect(callsTo("attachment.deleteMany")).toHaveLength(0);
  });

  it("rejects a disguised non-image before the storage driver receives bytes", async () => {
    const response = await POST(photoRequest(new File(["<html>malicious</html>"], "fake.png", { type: "image/png" })), ctx);
    expect(response.status).toBe(400);
    expect(storage.storeUpload).not.toHaveBeenCalled();
    expect(callsTo("attachment.create")).toHaveLength(0);
  });

  it.each(["inactive", "password", "forced"])("refuses a %s session even with a valid cookie", async (state) => {
    handlers["user.findFirst"] = () => ({ active: state !== "inactive", mustChangePassword: state === "forced", passwordChangedAt: state === "password" ? new Date(10000) : null });
    const response = await POST(photoRequest(), ctx);
    expect(response.status).toBe(401);
    expect(callsTo("product.findFirst")).toHaveLength(0);
    expect(storage.storeUpload).not.toHaveBeenCalled();
  });

  it("cleans up newly stored bytes if persisting the image fails without removing the old photo", async () => {
    handlers["attachment.create"] = () => { throw new Error("DB unavailable"); };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(photoRequest(), ctx);
    expect(response.status).toBe(500);
    expect(storage.removeUpload).toHaveBeenCalledExactlyOnceWith(upload.storage, upload.path);
    expect(callsTo("attachment.deleteMany")).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("removes photo rows and bytes within the current product and shop only", async () => {
    const response = await DELETE(new Request("http://localhost:3020/inventory/product_a/photo", { method: "DELETE" }), ctx);
    expect(await response.json()).toEqual({ ok: true, imageUrl: null });
    expect(whereOf("attachment.deleteMany")).toEqual({ shopId: "shop_a", productId: "product_a", id: { in: ["old_photo"] } });
    expect(storage.removeUpload).toHaveBeenCalledWith(oldPhoto.storage, oldPhoto.path);
  });

  it("refuses requests from another website", async () => {
    const response = await DELETE(new Request("http://localhost:3020/inventory/product_a/photo", { method: "DELETE", headers: { origin: "https://attacker.example" } }), ctx);
    expect(response.status).toBe(403);
    expect(callsTo("product.findFirst")).toHaveLength(0);
  });
});
