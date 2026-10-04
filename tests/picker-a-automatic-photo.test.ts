import { beforeEach, describe, expect, it, vi } from "vitest";

import { handlers, resetDb, whereOf } from "./helpers/db-mock";
import { clearRateLimit } from "@/lib/rate-limit";

/**
 * A picture chosen on purpose from the catalog is a picture: the product must not go to the internet
 * for a reference photo, even when its name alone would not have matched anything.
 */

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/auth", () => ({ passwordVersion: () => 0 }));
const external = vi.hoisted(() => ({ searchCommonsPhoto: vi.fn() }));
vi.mock("@/lib/inventory/commons-photos", async (original) => ({ ...await original(), searchCommonsPhoto: external.searchCommonsPhoto }));
const storage = vi.hoisted(() => ({ storeUpload: vi.fn(), removeUpload: vi.fn() }));
vi.mock("@/lib/storage", () => storage);

import { bestCatalogMatch, catalogEntryByKey } from "@/lib/catalog/match";
import { getAutomaticProductPhoto } from "@/lib/inventory/automatic-product-photos";

const session = { shopId: "shop_pick", userId: "user_a", pv: 0 };
const NAME = "Zorblax XJ-9 whatsit";
let catalogImage: string | null;

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();
  clearRateLimit(`automatic-photo:${session.shopId}`);
  catalogImage = null;
  handlers["$queryRaw"] = () => [];
  handlers["product.findFirst"] = () => ({ id: "product_a", name: NAME, category: null, catalogImage, attachments: [], automaticPhoto: null });
  handlers["user.findFirst"] = () => ({ active: true, mustChangePassword: false, passwordChangedAt: null });
  handlers["automaticProductPhoto.count"] = () => 0;
  handlers["automaticProductPhoto.upsert"] = () => ({});
  handlers["automaticProductPhoto.updateMany"] = () => ({ count: 0 });
  external.searchCommonsPhoto.mockResolvedValue(null);
});

describe("automatic internet photo and a chosen catalog picture", () => {
  it("the test name really matches nothing by itself", () => {
    expect(bestCatalogMatch({ name: NAME })).toBeNull();
  });

  it("skips the internet lookup and reports the chosen picture", async () => {
    catalogImage = "wall-charger";
    const result = await getAutomaticProductPhoto("product_a", session);
    expect(result).toMatchObject({ ok: true, status: "skipped", imageUrl: catalogEntryByKey("wall-charger")!.image });
    expect(external.searchCommonsPhoto).not.toHaveBeenCalled();
    expect(storage.storeUpload).not.toHaveBeenCalled();
    expect(whereOf("product.findFirst")).toMatchObject({ id: "product_a", shopId: session.shopId });
  });

  it("still looks on the internet for an unmatched name with no chosen picture", async () => {
    await getAutomaticProductPhoto("product_a", session);
    expect(external.searchCommonsPhoto).toHaveBeenCalledTimes(1);
  });

  it("ignores a chosen key that is not in the catalog", async () => {
    catalogImage = "not-a-picture";
    await getAutomaticProductPhoto("product_a", session);
    expect(external.searchCommonsPhoto).toHaveBeenCalledTimes(1);
  });
});
