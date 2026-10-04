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
    // The catalog now has a TV panel and a printer picture, so those two no longer wait for a photo lookup.
    expect(productImageSource({ name: "TV replacement LCD panel", category: "Parts" }).src).toBe("/images/catalog/tv-panel.webp");
    expect(productImageSource({ name: "PS5 motherboard", category: "Parts" }).src).toBeNull();
    expect(productImageSource({ name: "Laser printer" }).src).toBe("/images/catalog/printer.webp");
    expect(deviceImageSource("Drone DJI Mavic")?.src).toBe("/images/products/drone.webp");
  });
});

describe("cable photo", () => {
  // The catalog has a picture for each kind of cable, so a real cable gets the picture of its own kind.
  it.each([
    ["Lightning cable", "/images/catalog/lightning-cable.webp"],
    ["USB-C cable", "/images/products/usb-c-cable.webp"],
    ["HDMI cable", "/images/catalog/hdmi-cable.webp"],
    ["Micro USB cable", "/images/catalog/micro-usb-cable.webp"],
    ["USB-C to Lightning cable", "/images/catalog/lightning-cable.webp"],
    ["Replacement Lightning cable", "/images/catalog/lightning-cable.webp"],
    ["Micro-USB 1m", "/images/catalog/micro-usb-cable.webp"],
    ["Charging cable", "/images/products/usb-c-cable.webp"],
  ])("still gives the real cable %s a cable photo", (name, src) => {
    expect(productImageSource({ name }).src).toBe(src);
  });

  // Only the name says whether it is a part: shops file real cables under "Cables & Connectors".
  it.each([
    ["USB-C cable", "Cables & Connectors", "/images/products/usb-c-cable.webp"],
    ["Lightning cable", "Ports & Connectors", "/images/catalog/lightning-cable.webp"],
    ["iPhone charging cable", "Boards", "/images/catalog/lightning-cable.webp"],
    ["Lightning to USB cable", "Charging Modules", "/images/catalog/lightning-cable.webp"],
    ["Charging cable", "Boards", "/images/products/usb-c-cable.webp"],
  ])("keeps the cable photo for the real cable %s filed under %s", (name, category, src) => {
    expect(productImageSource({ name, category }).src).toBe(src);
  });

  it("still withholds the cable photo from a part, whatever its category", () => {
    expect(productImageSource({ name: "Lightning connector", category: "Cables" }).src).not.toBe("/images/products/usb-c-cable.webp");
    expect(productImageSource({ name: "iPhone 12 Lightning Charging Port", category: "Cables & Connectors" }).src).toBe("/images/products/charging-port.webp");
  });

  it("labels a plain USB-C or charging cable as such", () => {
    expect(productImageSource({ name: "USB-C charging cable" }).alt).toContain("USB-C cable");
    expect(productImageSource({ name: "Lightning cable" }).alt).toContain("Lightning cable");
  });

  it.each([
    "iPhone 12 Lightning Charging Port",
    "Micro USB charging port",
    "Lightning connector",
    "Lightning Audio Jack",
    "Samsung micro-usb socket",
    "iPhone Lightning charge board",
    "USB-C charging port module",
    "iPhone 11 Lightning dock assembly",
    "Lightning replacement",
    "Charging Cable Flex",
    "USB-C Cable Connector",
  ])("does not give the repair part %s a cable photo", (name) => {
    expect(productImageSource({ name }).src).not.toBe("/images/products/usb-c-cable.webp");
  });

  it("gives a charging port its port photo, not a cable's", () => {
    expect(productImageSource({ name: "iPhone 12 Lightning Charging Port", category: "Parts" }).src).toBe("/images/products/charging-port.webp");
    expect(productImageSource({ name: "Micro USB charging port" }).src).toBe("/images/products/charging-port.webp");
  });

  it("leaves a part that has no illustration for the photo lookup", () => {
    expect(productImageSource({ name: "Lightning connector" }).src).toBeNull();
    expect(productImageSource({ name: "Lightning Audio Jack" }).src).toBeNull();
  });

  it("keeps the HDMI port and flex-cable rules as they were", () => {
    expect(productImageSource({ name: "HDMI port" }).src).toBe("/images/products/hdmi-port.webp");
    expect(productImageSource({ name: "HDMI flex cable" }).src).toBeNull();
    expect(productImageSource({ name: "Lightning Charging Port Flex Cable" }).src).toBe("/images/products/charging-port.webp");
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

describe("devices that used to show only an icon", () => {
  it.each([
    ["ThinkPad T420", "laptop"], ["MacBook Air", "laptop"], ["Dell XPS 13 laptop", "laptop"],
    ["Gaming desktop PC", "desktop-computer"], ["iMac 24", "desktop-computer"],
    ["Apple Watch Series 9", "smartwatch"], ["Galaxy Watch 6", "smartwatch"],
    ["Wireless headphones", "headphones"], ["AirPods Pro", "earbuds"], ["Bluetooth earbuds", "earbuds"],
    ["Nikon DSLR", "camera"], ["GoPro Hero", "camera"],
  ])("gives %s the %s photo", (name, file) => {
    expect(productImageSource({ name }).src).toBe(`/images/products/${file}.webp`);
  });

  it("shows the device for a repair service on it", () => {
    expect(productImageSource({ name: "Laptop repair", category: "Services" }).src).toBe("/images/products/laptop.webp");
    expect(productImageSource({ name: "Computer repair", category: "Services" }).src).toBe("/images/products/desktop-computer.webp");
  });

  it("never uses a device photo or a phone part photo for that device's parts", () => {
    // The catalog now has laptop parts of its own, so these get the laptop part, never the laptop or a phone part.
    expect(productImageSource({ name: "Laptop battery", category: "Parts" }).src).toBe("/images/catalog/laptop-battery.webp");
    expect(productImageSource({ name: "MacBook screen replacement", category: "Parts" }).src).toBe("/images/catalog/laptop-lcd.webp");
    // A part the catalog has no picture for still gets nothing, not a laptop and not a phone part.
    expect(productImageSource({ name: "Laptop charging port", category: "Parts" }).src).toBeNull();
    expect(productImageSource({ name: "MacBook logic board", category: "Parts" }).src).toBeNull();
    expect(productImageSource({ name: "Laptop hinge", category: "Parts" }).src).toBeNull();
  });

  it("reads watches before phones (Galaxy Watch is not a Galaxy phone)", () => {
    expect(deviceImageSource("Galaxy Watch 6")?.kind).toBe("watch");
    expect(deviceImageSource("Galaxy S23")?.kind).toBe("phone");
    expect(deviceImageSource("Laptop Dell XPS 13 9310")?.src).toBe("/images/products/laptop.webp");
    expect(deviceImageSource("Computer Custom Build Ryzen 5600 / RTX 3060")?.src).toBe("/images/products/desktop-computer.webp");
  });
});

describe("category alone does not pick a device photo", () => {
  it("does not give a mouse or a hub filed under Computers a computer picture", () => {
    // They now get their own pictures; what matters is that the category never turns them into a computer, laptop or headphones.
    expect(productImageSource({ name: "Wireless mouse", category: "Computers" }).src).toBe("/images/catalog/mouse.webp");
    expect(productImageSource({ name: "USB hub", category: "Computers" }).src).toBe("/images/catalog/usb-hub.webp");
    expect(productImageSource({ name: "Podcast microphone", category: "Audio" }).src).toBe("/images/catalog/microphone.webp");
    expect(productImageSource({ name: "Trackball", category: "Computers" }).src).toBeNull();
    expect(productImageSource({ name: "Studio thing", category: "Audio" }).src).toBeNull();
  });

  it("still uses the category when the name names the device", () => {
    expect(productImageSource({ name: "ThinkPad T420", category: "Computers" }).src).toBe("/images/products/laptop.webp");
  });
});
