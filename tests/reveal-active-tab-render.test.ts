import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterTabs } from "@/components/ui/filter-tabs";
import { RevealActiveTab } from "@/components/tickets/reveal-active-tab";

/**
 * The wrapper must be invisible to layout and must keep the tab row exactly as
 * FilterTabs renders it: same links, same `aria-current`, same words. The
 * scrolling itself happens in the browser (a layout effect), which a static
 * render does not run; tests/tab-row-scroll.test.ts covers where it scrolls to.
 */

const tabs = [
  { label: "Open jobs", href: "/tickets", count: 12 },
  { label: "Resolved", href: "/tickets?status=Resolved", active: true, count: 4 },
];

describe("RevealActiveTab", () => {
  it("renders the tab row unchanged inside a box-less wrapper", () => {
    const bare = renderToStaticMarkup(React.createElement(FilterTabs, { tabs, "aria-label": "Repair views" }));
    const wrapped = renderToStaticMarkup(
      React.createElement(RevealActiveTab, null, React.createElement(FilterTabs, { tabs, "aria-label": "Repair views" })),
    );
    expect(wrapped).toBe(`<div class="contents">${bare}</div>`);
  });

  it("keeps the current tab marked, with its word and count", () => {
    const wrapped = renderToStaticMarkup(
      React.createElement(RevealActiveTab, null, React.createElement(FilterTabs, { tabs })),
    );
    expect(wrapped).toContain('aria-current="page"');
    expect(wrapped).toContain("Resolved");
    expect(wrapped).toContain('role="navigation"');
  });
});
