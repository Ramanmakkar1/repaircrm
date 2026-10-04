import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The Easy-mode "Change group" panel marks the shelf you are looking at: the
 * box is outlined, says "Current" in words, and carries aria-current, so the
 * choice is visible on screen and to a screen reader. Nothing else changes.
 */

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { StockGroupTiles, groupTiles } = await import("@/components/inventory/stock-group-tiles");
const { SupplierFilter } = await import("@/components/inventory/supplier-filter");
const { inventoryGroups } = await import("@/lib/inventory/groups");

const groups = inventoryGroups([
  { id: "a", name: "iPhone 12 Battery", category: "Parts", stockQty: 14 },
  { id: "b", name: "Tempered Glass Screen Protector", category: "Accessories", stockQty: 48 },
]);
const tiles = groupTiles(groups, { quantity: 62, productIds: ["a", "b"] }, (key) => `/inventory?group=${encodeURIComponent(key)}`);

const html = (current?: string | null) => renderToStaticMarkup(createElement(StockGroupTiles, { tiles, current }));
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

describe("StockGroupTiles current shelf", () => {
  it("marks no box when no shelf is chosen", () => {
    for (const markup of [html(), html(null), html("")]) {
      expect(markup).not.toContain("aria-current");
      expect(markup).not.toContain(">Current<");
      expect(markup).not.toContain("border-accent");
    }
  });

  it("marks exactly the chosen group: tinted outline, the word Current, aria-current", () => {
    const markup = html("batteries");
    expect(count(markup, 'aria-current="true"')).toBe(1);
    expect(count(markup, "Current</span>")).toBe(1);
    expect(count(markup, "border-accent")).toBe(1);

    // The marked cell is the Batteries one, and its link still opens that group.
    const cell = markup.split("<li").find((part) => part.includes("aria-current"));
    expect(cell).toContain('href="/inventory?group=batteries"');
    expect(cell).toContain("Batteries");
    expect(cell).toContain("bg-accent-soft");
  });

  it("can mark the All products box", () => {
    const markup = html("all");
    const cell = markup.split("<li").find((part) => part.includes("aria-current"));
    expect(cell).toContain('href="/inventory?group=all"');
    expect(cell).toContain("All products");
  });

  it("ignores a key that matches no box, and keeps every box a link", () => {
    const markup = html("nope");
    expect(markup).not.toContain("aria-current");
    expect(count(markup, "<a ")).toBe(tiles.length);
  });
});

describe("SupplierFilter", () => {
  it("starts closed, names the chosen supplier and keeps every supplier one tap away", () => {
    const options = [
      { label: "All", href: "/inventory/purchase-orders" },
      { label: "Lone Star Cell Supply", href: "/inventory/purchase-orders?vendorId=v1", active: true },
    ];
    const markup = renderToStaticMarkup(createElement(SupplierFilter, { current: "Lone Star Cell Supply", options }));
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
    expect(markup).toContain("Supplier: ");
    expect(markup).toContain("Lone Star Cell Supply");
    expect(markup).toContain('href="/inventory/purchase-orders?vendorId=v1"');
    expect(markup).toContain('href="/inventory/purchase-orders"');
  });
});
