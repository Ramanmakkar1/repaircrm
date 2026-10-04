import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const { DOCUMENT_GRID_CLASS, DocumentGrid } = await import("@/components/billing/document-cards");

const render = () =>
  renderToStaticMarkup(createElement(DocumentGrid, null, createElement("li", { key: "a" }, "card")) as never);

describe("DocumentGrid", () => {
  it("keeps one column on a portrait tablet and goes to two only from 1024px", () => {
    const out = render();
    // Two columns at 768px made each card ~345px wide and cut the customer name off.
    expect(out).toContain("md:grid-cols-1");
    expect(out).toContain("lg:grid-cols-2");
    expect(out).toContain("2xl:grid-cols-3");
  });

  it("replaces the kit's two-column tablet rule rather than stacking on top of it", () => {
    const out = render();
    expect(out).not.toContain("md:grid-cols-2");
    // The phone default stays: one column below 768px.
    expect(out).toContain("grid-cols-1");
  });

  it("exports the same classes it applies, so a page can reuse them", () => {
    expect(DOCUMENT_GRID_CLASS).toBe("md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3");
  });
});
