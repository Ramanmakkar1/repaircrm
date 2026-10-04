import { describe, expect, it } from "vitest";

import { CATALOG } from "@/lib/catalog/entries";
import { normalizeCatalogImage, readCatalogImageField } from "@/lib/inventory/catalog-image";

describe("normalizeCatalogImage", () => {
  it("keeps a real catalog key", () => {
    expect(normalizeCatalogImage("screen-protector")).toBe("screen-protector");
  });

  it("accepts every key the catalog owns", () => {
    for (const entry of CATALOG) expect(normalizeCatalogImage(entry.key), entry.key).toBe(entry.key);
  });

  it("trims a padded key", () => {
    expect(normalizeCatalogImage("  screen-protector \n")).toBe("screen-protector");
  });

  it("treats empty and blank as automatic", () => {
    expect(normalizeCatalogImage("")).toBeNull();
    expect(normalizeCatalogImage("   ")).toBeNull();
  });

  it("treats an unknown key as automatic, never an error", () => {
    for (const raw of ["nope", "glass guard", "/images/catalog/tripod.webp", "TRIPOD", "__proto__", "constructor", "../etc/passwd"]) {
      expect(normalizeCatalogImage(raw), raw).toBeNull();
    }
  });

  it("treats anything that is not a string as automatic", () => {
    for (const raw of [null, undefined, 0, 42, true, {}, [], ["screen-protector"], new File(["x"], "x.txt")]) {
      expect(normalizeCatalogImage(raw)).toBeNull();
    }
  });
});

describe("readCatalogImageField", () => {
  it("reports a valid key as present", () => {
    const fd = new FormData();
    fd.set("catalogImage", "screen-protector");
    expect(readCatalogImageField(fd)).toEqual({ present: true, value: "screen-protector" });
  });

  it("reports an empty value as present and automatic (this is how a picture is cleared)", () => {
    const fd = new FormData();
    fd.set("catalogImage", "");
    expect(readCatalogImageField(fd)).toEqual({ present: true, value: null });
  });

  it("reports an invalid key as present but automatic", () => {
    const fd = new FormData();
    fd.set("catalogImage", "not-a-picture");
    expect(readCatalogImageField(fd)).toEqual({ present: true, value: null });
  });

  it("reports an absent field as not present", () => {
    const fd = new FormData();
    fd.set("name", "Glass guard");
    expect(readCatalogImageField(fd)).toEqual({ present: false, value: null });
  });

  it("ignores a file posted under the field name", () => {
    const fd = new FormData();
    fd.set("catalogImage", new File(["x"], "x.png", { type: "image/png" }));
    expect(readCatalogImageField(fd)).toEqual({ present: true, value: null });
  });
});
