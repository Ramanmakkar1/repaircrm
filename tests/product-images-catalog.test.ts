import { describe, expect, it } from "vitest";

import { CATALOG } from "@/lib/catalog/entries";
import { deviceImageSource, productImageKind, productImageSource } from "@/lib/inventory/product-images";

describe("which picture a product shows, in order", () => {
  it("1. its own uploaded photo beats everything", () => {
    const source = productImageSource({ name: "Tempered glass", catalogImage: "wall-charger", imageUrl: "/files/photo_1" });
    expect(source).toMatchObject({ src: "/files/photo_1", alt: "Tempered glass", illustrative: false, catalogKey: null });
  });

  it("2. a catalog picture chosen on purpose beats the name", () => {
    const source = productImageSource({ name: "iPhone 14", catalogImage: "tripod" });
    expect(source).toMatchObject({ src: "/images/catalog/tripod.webp", illustrative: true, catalogKey: "tripod" });
    expect(source.alt).toBe("Tripod / selfie stick category illustration");
    // It also beats the category and a service name.
    expect(productImageSource({ name: "TV repair", category: "Services", catalogImage: "tv-remote" }).src).toBe("/images/products/tv-remote.webp");
  });

  it("works with the older pictures too", () => {
    expect(productImageSource({ name: "Whatever", catalogImage: "screen-protector" }).src).toBe("/images/products/screen-protector.webp");
  });

  it("3. otherwise the picture matched from the name", () => {
    expect(productImageSource({ name: "Glass guard Redmi Note 11" })).toMatchObject({ src: "/images/products/screen-protector.webp", catalogKey: "screen-protector", illustrative: true });
    expect(productImageSource({ name: "Wall mount TV 43 inch" }).src).toBe("/images/catalog/tv-wall-mount.webp");
    expect(productImageSource({ name: "JBL speaker" }).src).toBe("/images/catalog/bluetooth-speaker.webp");
  });

  it("4. otherwise no picture, so the app shows its normal placeholder", () => {
    expect(productImageSource({ name: "Misc item" })).toMatchObject({ src: null, catalogKey: null, illustrative: true, alt: "No photo for Misc item" });
    expect(productImageSource({ name: "Gift", category: "Accessories" }).src).toBeNull();
  });

  it("ignores a catalog key that does not exist, or is not a key", () => {
    for (const catalogImage of ["nope", "", "  ", null, undefined, "/images/catalog/tripod.webp", "TRIPOD", "__proto__"]) {
      expect(productImageSource({ name: "Mystery gadget", catalogImage }).src, String(catalogImage)).toBeNull();
      expect(productImageSource({ name: "Tripod", catalogImage }).src, String(catalogImage)).toBe("/images/catalog/tripod.webp");
    }
  });

  it("only trusts the authenticated file endpoint as an uploaded photo", () => {
    expect(productImageSource({ name: "Mouse", imageUrl: "https://example.com/a.png", catalogImage: "keyboard" }).src).toBe("/images/catalog/keyboard.webp");
    expect(productImageSource({ name: "Mouse", imageUrl: "/files/../../etc/passwd" }).src).toBe("/images/catalog/mouse.webp");
  });
});

describe("every catalog picture is reachable through the picker's helper", () => {
  it("shows an entry's own picture for its label (a plain 'Motherboard' is ambiguous on purpose)", () => {
    for (const entry of CATALOG) {
      if (entry.key === "motherboard") continue;
      expect(productImageSource({ name: entry.label }).src, entry.label).toBe(entry.image);
    }
  });

  it("shows an entry's own picture when it is chosen on purpose", () => {
    for (const entry of CATALOG) expect(productImageSource({ name: "Anything", catalogImage: entry.key }).src, entry.key).toBe(entry.image);
  });
});

describe("the kind of product, for the placeholder icon and the label", () => {
  it.each([
    ["Tempered glass", "protector"],
    ["Privacy screen protector", "protector"],
    ["Silicone case iPhone 13", "case"],
    ["Earbuds case", "case"],
    ["USB-C fast charger", "charger"],
    ["Wall charger 20W", "charger"],
    ["iPhone 14 screen assembly", "display"],
    ["Laptop screen 15.6", "display"],
    ["iPhone 12 charging port", "port"],
    ["Galaxy S23 Battery", "part"],
    ["Laptop battery", "part"],
    ["USB-C cable", "part"],
    ["Lightning cable", "part"],
    ["Drone motor", "part"],
    ["iPhone 14", "phone"],
    ["Galaxy Tab A8", "tablet"],
    ["Dell laptop", "laptop"],
    ["Gaming PC", "computer"],
    ["Samsung Smart TV", "television"],
    ["PS5", "console"],
    ["Nintendo Switch", "console"],
    ["DJI Mavic", "drone"],
    ["Apple Watch", "watch"],
    ["AirPods", "audio"],
    ["Sony headphones", "audio"],
    ["Nikon DSLR", "camera"],
    ["Water damage repair", "service"],
    ["Unlock service", "service"],
    ["Screen repair", "service"],
    ["TV repair", "service"],
    ["Labour", "service"],
    ["Mouse", "product"],
    ["Ring light", "product"],
    ["Misc item", "product"],
    ["Gift", "product"],
  ] as const)("%s is a %s", (name, kind) => {
    expect(productImageKind({ name })).toBe(kind);
  });

  it("still calls a part with no picture a part", () => {
    expect(productImageKind({ name: "Lightning connector" })).toBe("part");
    expect(productImageKind({ name: "Laptop hinge" })).toBe("part");
  });

  it("is a service whatever picture it gets, and a repair card is not a product for sale", () => {
    expect(productImageKind({ name: "Screen repair", category: "Services" })).toBe("service");
    expect(productImageSource({ name: "iPad repair" })).toMatchObject({ kind: "service", src: "/images/products/tablet.webp" });
    expect(productImageSource({ name: "Water damage repair" })).toMatchObject({ kind: "service", src: "/images/catalog/water-damage.webp" });
  });

  it("follows a catalog picture chosen on purpose", () => {
    expect(productImageKind({ name: "Anything", catalogImage: "wall-charger" })).toBe("charger");
    expect(productImageSource({ name: "Anything", catalogImage: "tv-panel" }).kind).toBe("display");
  });
});

describe("deviceImageSource (repair cards: asset type and model)", () => {
  it("returns the device family's picture, label and kind", () => {
    expect(deviceImageSource("Phone iPhone 14 Pro")).toEqual({ src: "/images/products/phone.webp", label: "Phone", kind: "phone" });
    expect(deviceImageSource("Laptop Dell XPS 13")).toEqual({ src: "/images/products/laptop.webp", label: "Laptop", kind: "laptop" });
    expect(deviceImageSource("Game console PlayStation 5")).toEqual({ src: "/images/products/game-console.webp", label: "Game console", kind: "console" });
    expect(deviceImageSource("Nintendo Switch")).toEqual({ src: "/images/products/handheld-console.webp", label: "Handheld console", kind: "console" });
    expect(deviceImageSource("Watch Apple Watch SE")).toEqual({ src: "/images/products/smartwatch.webp", label: "Smartwatch", kind: "watch" });
    expect(deviceImageSource("AirPods Pro")).toEqual({ src: "/images/products/earbuds.webp", label: "Earbuds", kind: "audio" });
    expect(deviceImageSource("Computer Custom Build Ryzen 5600 / RTX 3060")).toMatchObject({ src: "/images/products/desktop-computer.webp", kind: "computer" });
    expect(deviceImageSource("TV Samsung 55 inch")).toMatchObject({ src: "/images/products/television.webp", kind: "television" });
  });

  it("gives nothing for an unknown device, and never a part picture", () => {
    expect(deviceImageSource("Other")).toBeNull();
    expect(deviceImageSource("")).toBeNull();
    expect(deviceImageSource("Tempered glass")).toBeNull();
  });
});

describe("a device photo never stands in for that device's parts", () => {
  const DEVICES = ["iPhone 14", "Galaxy Tab A8", "Dell laptop", "Gaming PC", "Samsung TV", "PS5", "Nintendo Switch", "DJI Mavic", "Apple Watch", "AirPods", "Sony headphones", "Nikon DSLR"];
  // None of these has a catalog picture, so the product gets the placeholder, not the device.
  const PARTS = ["hinge", "chip", "sensor", "inverter", "bezel assembly", "trackpad"];

  it.each(DEVICES.flatMap((device) => PARTS.map((part) => [device, part] as const)))("%s %s gets no device picture", (device, part) => {
    const src = productImageSource({ name: `${device} ${part}`, category: "Parts" }).src;
    for (const entry of CATALOG.filter((item) => item.group === "Devices")) expect(src, `${device} ${part}`).not.toBe(entry.image);
  });
});
