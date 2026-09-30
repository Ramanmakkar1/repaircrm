import { describe, expect, it } from "vitest";
import { deviceImageSource, productImageKind, productImageSource, PRODUCT_PHOTO_MAX_BYTES, validateProductPhoto } from "@/lib/inventory/product-images";

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

  it.each([
    ["iPad tablet", "tablet"], ["iPhone battery", "phone-battery"], ["Galaxy camera module", "camera-module"],
    ["iPhone earpiece speaker", "earpiece-speaker"], ["Mobile logic board", "circuit-board"], ["USB-C charging cable", "usb-c-cable"],
    ["iPhone back glass", "back-glass"], ["Smart television", "television"], ["TV remote", "tv-remote"],
    ["TV power supply board", "tv-power-board"], ["TV motherboard", "tv-main-board"], ["TV LED backlight strips", "tv-backlight-strips"],
    ["Precision repair tools", "repair-tools"], ["PlayStation PS5", "game-console"], ["Xbox controller", "game-controller"],
    ["Nintendo Switch handheld", "handheld-console"], ["Controller analog stick", "analog-stick"], ["PS5 cooling fan", "console-cooling-fan"],
    ["PS5 HDMI port", "hdmi-port"], ["DJI Mavic drone", "drone"], ["DJI propellers", "drone-propellers"],
    ["Mavic battery", "drone-battery"], ["Drone gimbal camera", "drone-camera-gimbal"], ["Drone motor", "drone-motor"],
    ["Drone controller", "drone-controller"],
  ])("chooses the right family and part for %s", (name, file) => {
    expect(productImageSource({ name }).src).toBe(`/images/products/${file}.webp`);
  });

  it("uses device illustrations for services and leaves unsupported parts for lookup", () => {
    expect(productImageSource({ name: "TV repair", category: "Services" }).src).toBe("/images/products/television.webp");
    expect(productImageSource({ name: "Drone motor repair", category: "Services" }).src).toBe("/images/products/drone.webp");
    expect(productImageSource({ name: "TV replacement LCD panel", category: "Parts" }).src).toBeNull();
    expect(productImageSource({ name: "PS5 motherboard", category: "Parts" }).src).toBeNull();
    expect(productImageSource({ name: "ThinkPad T420" }).src).toBeNull();
    expect(deviceImageSource("Drone DJI Mavic")?.src).toBe("/images/products/drone.webp");
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
