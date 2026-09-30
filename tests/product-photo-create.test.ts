import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, dataOf, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ shopId: "shop_a", userId: "user_a", role: "OWNER" }) }));
const storage = vi.hoisted(() => ({ storeUpload: vi.fn(), removeUpload: vi.fn() }));
vi.mock("@/lib/storage", () => storage);
import { createProductAction } from "@/app/(app)/inventory/actions";

const upload = { path: "shop_a/new.png", storage: "s3", fileName: "new.png", mimeType: "image/png", sizeBytes: 16 };
function newProduct(file: File) {
  const form = new FormData();
  form.set("name", "Tempered glass"); form.set("price", "19.99"); form.set("sku", "GLASS-1000"); form.set("photo", file);
  return form;
}
function photo() { return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])], "new.png", { type: "image/png" }); }

beforeEach(() => {
  resetDb(); vi.clearAllMocks();
  handlers["product.findFirst"] = () => null;
  handlers["product.create"] = () => ({ id: "product_a", sku: "GLASS-1000", stockQty: 0 });
  handlers["attachment.create"] = () => ({ id: "photo_a" });
  storage.storeUpload.mockResolvedValue({ ok: true, upload });
  storage.removeUpload.mockResolvedValue(undefined);
});

describe("photo on product creation", () => {
  it("writes photo metadata in the product creation transaction with trusted shop and uploader", async () => {
    await expect(createProductAction(undefined, newProduct(photo()))).rejects.toThrow("REDIRECT:/inventory/product_a?flash=created");
    expect(dataOf("attachment.create")).toMatchObject({ ...upload, shopId: "shop_a", uploadedById: "user_a", productId: "product_a" });
    expect(callsTo("$transaction")).toHaveLength(1);
    expect(storage.removeUpload).not.toHaveBeenCalled();
  });

  it("removes stored photo bytes when a duplicate SKU prevents creating the product", async () => {
    handlers["product.findFirst"] = () => ({ id: "existing_product" });
    const result = await createProductAction(undefined, newProduct(photo()));
    expect(result?.fieldErrors?.sku).toContain("SKU");
    expect(storage.removeUpload).toHaveBeenCalledExactlyOnceWith(upload.storage, upload.path);
    expect(callsTo("attachment.create")).toHaveLength(0);
  });

  it("rejects disguised non-images before either writing bytes or creating a product", async () => {
    const result = await createProductAction(undefined, newProduct(new File(["<svg/>"], "fake.png", { type: "image/png" })));
    expect(result?.fieldErrors?.photo).toContain("valid JPG");
    expect(storage.storeUpload).not.toHaveBeenCalled();
    expect(callsTo("product.create")).toHaveLength(0);
  });
});
