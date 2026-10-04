import { describe, expect, it } from "vitest";

import { groupPhoto, inventoryGroup, inventoryGroups, type GroupProduct } from "@/lib/inventory/groups";

/**
 * The Easy-mode Stock overview: every product lands in one shelf group, and the
 * groups are listed in the order a counter person looks for them.
 */

function item(id: string, name: string, stockQty: number, category: string | null = null): GroupProduct {
  return { id, name, category, stockQty };
}

describe("inventoryGroup", () => {
  it.each([
    ["Tempered glass 14", null, "screen-guards"],
    ["iPhone 12 Screen Protector", null, "screen-guards"],
    ["Screen guard", null, "screen-guards"],
    ["Phone batteries", null, "batteries"],
    ["iPhone 12 OLED Screen", "Parts", "screens"],
    ["Lightning Charging Port", null, "ports"],
    ["HDMI port", null, "ports"],
    ["USB-C cable", null, "charging"],
    ["Charger 20W", null, "charging"],
  ])("puts %s (%s) on the %s shelf", (name, category, key) => {
    expect(inventoryGroup({ name, category }).key).toBe(key);
  });

  it("checks the specific shelves first: a screen guard is not a screen, a battery connector is a battery", () => {
    expect(inventoryGroup({ name: "iPhone 12 screen guard", category: null }).key).toBe("screen-guards");
    expect(inventoryGroup({ name: "Battery connector", category: null }).key).toBe("batteries");
  });

  it("reads the category too, so a part filed under Screens lands with the screens", () => {
    expect(inventoryGroup({ name: "iPhone 12 panel", category: "Screens" }).key).toBe("screens");
  });

  it("falls back to the shop's own category, trimmed", () => {
    expect(inventoryGroup({ name: "Phone case", category: " Accessories " })).toEqual({
      key: "category:Accessories",
      label: "Accessories",
    });
  });

  it("calls a product with no usable category 'Other items'", () => {
    const other = { key: "category:Other items", label: "Other items" };
    expect(inventoryGroup({ name: "Mystery", category: null })).toEqual(other);
    expect(inventoryGroup({ name: "Mystery", category: "   " })).toEqual(other);
  });
});

describe("inventoryGroups", () => {
  it("is empty for an empty shelf", () => {
    expect(inventoryGroups([])).toEqual([]);
  });

  it("adds up the quantity and collects the product ids of each group", () => {
    const groups = inventoryGroups([
      item("a", "iPhone 12 Screen", 3),
      item("b", "Galaxy S21 Screen", 4),
      item("c", "iPhone 12 Battery", 5),
    ]);

    expect(groups).toEqual([
      { key: "screens", label: "Screens", quantity: 7, productIds: ["a", "b"] },
      { key: "batteries", label: "Batteries", quantity: 5, productIds: ["c"] },
    ]);
  });

  it("lists the common shelves first in a fixed order, whatever order the products arrive in", () => {
    const groups = inventoryGroups([
      item("1", "Lightning cable", 1),
      item("2", "Charging port", 1),
      item("3", "iPhone battery", 1),
      item("4", "iPhone screen", 1),
      item("5", "Screen protector", 1),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "screen-guards",
      "screens",
      "batteries",
      "ports",
      "charging",
    ]);
  });

  it("puts the shop's own categories after the common shelves, alphabetically", () => {
    const groups = inventoryGroups([
      item("1", "Soldering iron", 1, "Tools"),
      item("2", "Phone case", 1, "Accessories"),
      item("3", "iPhone cable", 1),
      item("4", "iPhone screen", 1),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "Screens",
      "Cables & chargers",
      "Accessories",
      "Tools",
    ]);
  });

  it("does not change the list it was given", () => {
    const products = [item("1", "iPhone screen", 1), item("2", "Phone case", 2, "Accessories")];
    const copy = structuredClone(products);

    inventoryGroups(products);
    expect(products).toEqual(copy);
  });
});

describe("groupPhoto", () => {
  const never = () => {
    throw new Error("fallback should not be asked");
  };

  it("uses the fixed picture for each common shelf and for the 'all' tile", () => {
    for (const key of ["all", "screen-guards", "batteries", "screens", "ports", "charging"]) {
      expect(groupPhoto(key, "Anything", never)).toMatch(/^\/images\/products\/.+\.webp$/);
    }
  });

  it("asks the fallback, with the label, for a shop's own category", () => {
    const asked: string[] = [];
    const photo = groupPhoto("category:Tools", "Tools", (label) => {
      asked.push(label);
      return "/images/products/repair-tools.webp";
    });

    expect(photo).toBe("/images/products/repair-tools.webp");
    expect(asked).toEqual(["Tools"]);
  });

  it("falls back to the parts organiser when there is no better picture, so no shelf shows a bare icon", () => {
    expect(groupPhoto("category:Odds", "Odds", () => null)).toBe("/images/home/parts-bin.webp");
  });
});
