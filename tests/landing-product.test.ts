import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProductExplorer,
  PRODUCT_MODULES,
} from "@/components/landing/product-explorer";
import { shouldLoadHeroVideo } from "@/components/landing/hero/hero-media";

describe("product explorer", () => {
  const out = renderToStaticMarkup(React.createElement(ProductExplorer));
  it("starts at Counter with one selected tab and one visible panel", () => {
    expect(out.match(/role="tab"/g)).toHaveLength(PRODUCT_MODULES.length);
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out).toMatch(/id="product-tab-counter"[^>]*aria-selected="true"/);
    const panels = out.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels.filter((panel) => !panel.includes("hidden"))).toHaveLength(1);
    expect(panels.filter((panel) => panel.includes("hidden"))).toHaveLength(
      PRODUCT_MODULES.length - 1,
    );
  });
  it("connects every tab to its panel and exposes each deep-link destination", () => {
    for (const item of PRODUCT_MODULES) {
      expect(out).toContain(`aria-controls="product-panel-${item.key}"`);
      expect(out).toContain(`aria-labelledby="product-tab-${item.key}"`);
      expect(out).toContain(`id="${item.anchor}"`);
    }
  });
});

describe("repair film preferences", () => {
  it("does not request motion for reduced motion, data saver or slow connections", () => {
    expect(shouldLoadHeroVideo({ reducedMotion: true, saveData: false })).toBe(
      false,
    );
    expect(shouldLoadHeroVideo({ reducedMotion: false, saveData: true })).toBe(
      false,
    );
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(
        shouldLoadHeroVideo({
          reducedMotion: false,
          saveData: false,
          effectiveType,
        }),
      ).toBe(false);
    }
    expect(
      shouldLoadHeroVideo({
        reducedMotion: false,
        saveData: false,
        effectiveType: "4g",
      }),
    ).toBe(true);
    expect(shouldLoadHeroVideo({ reducedMotion: false, saveData: false })).toBe(
      true,
    );
  });
});
