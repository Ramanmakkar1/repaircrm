import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProductExplorer,
  PRODUCT_MODULES,
} from "@/components/landing/product-explorer";

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

describe("product screenshots on phones", () => {
  const out = renderToStaticMarkup(React.createElement(ProductExplorer));
  it("swaps in phone captures where they exist and crops the rest", () => {
    for (const src of ["home-phone.webp", "job-phone.webp", "invoice-phone.webp"]) {
      expect(out).toContain(`/marketing/app/${src}`);
    }
    expect(out.match(/site-shot-crop/g)).toHaveLength(2);
  });
});
