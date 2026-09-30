import { describe, expect, it } from "vitest";
import { productImageKind, productImageSource, PRODUCT_PHOTO_MAX_BYTES, validateProductPhoto } from "@/lib/inventory/product-images";

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);

describe("product image choices", () => {
  it("prioritises private uploaded photos without allowing arbitrary URLs", () => {
    expect(productImageSource({ name: "My phone", imageUrl: "/files/photo_123" })).toMatchObject({ src: "/files/photo_123", alt: "My phone", illustrative: false });
    expect(productImageSource({ name: "My phone", imageUrl: "https://tracker.example/photo.png" })).toMatchObject({ src: "/images/products/phone.webp", illustrative: true });
    expect(productImageSource({ name: "My phone", imageUrl: "/files/../../secret" }).src).toBe("/images/products/phone.webp");
  });

  it("keeps phone parts and repair categories from receiving a misleading phone photo", () => {
    expect(productImageKind({ name: "iPhone 14 screen assembly", category: "Repair parts" })).toBe("display");
    expect(productImageKind({ name: "Galaxy S23 Battery", category: "Parts" })).toBe("part");
    expect(productImageKind({ name: "USB-C cable" })).toBe("part");
    expect(productImageSource({ name: "iPhone 14 screen assembly" }).src).toBe("/images/products/display-assembly.webp");
    expect(productImageKind({ name: "iPhone 15 Pro Max Charging Port Replacement", category: "Parts" })).toBe("port");
    expect(productImageSource({ name: "iPhone 6S Screen Replacement", category: "Screens" })).toMatchObject({ src: "/images/products/display-assembly.webp", illustrative: true });
    expect(productImageKind({ name: "Screen repair", category: "Services" })).toBe("service");
    expect(productImageKind({ name: "Tempered glass screen guard", category: "Repair parts" })).toBe("protector");
    expect(productImageKind({ name: "Clear case for iPhone 14", category: "Accessories" })).toBe("case");
    expect(productImageKind({ name: "USB-C fast charger" })).toBe("charger");
  });
});

describe("product photo validation", () => {
  it("requires image signatures and MIME to agree", async () => {
    expect(await validateProductPhoto(new File([PNG_HEADER], "photo.png", { type: "image/png" }))).toBeNull();
    expect(await validateProductPhoto(new File(["<html>not a photo</html>"], "photo.png", { type: "image/png" }))).toContain("valid JPG");
    expect(await validateProductPhoto(new File([PNG_HEADER], "photo.jpg", { type: "image/jpeg" }))).toContain("valid JPG");
    expect(await validateProductPhoto(new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" }))).toContain("valid JPG");
  });

  it("refuses empty and oversized images before reading bytes", async () => {
    expect(await validateProductPhoto(new File([], "empty.png", { type: "image/png" }))).toContain("empty");
    expect(await validateProductPhoto(new File([new Uint8Array(PRODUCT_PHOTO_MAX_BYTES + 1)], "huge.png", { type: "image/png" }))).toContain("5 MB");
  });
});
