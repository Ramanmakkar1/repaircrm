import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import {
  groupPanels,
  OWNER_PANELS,
} from "@/components/settings/settings-panels";

const render = (simple: boolean) =>
  renderToStaticMarkup(React.createElement(SettingsSkeleton, { simple }));

/** Counts the pill-sized blocks (48px tall, rounded-xl) in a markup string. */
const pills = (html: string) => html.match(/class="[^"]*\bh-12\b[^"]*rounded-xl[^"]*"/g) ?? [];

describe("SettingsSkeleton (loading state)", () => {
  it("Easy mode draws the centred column with the two rows of pills", () => {
    const html = render(true);
    // Same wrapper the page uses in Easy mode.
    expect(html).toContain("mx-auto flex w-full max-w-5xl flex-col gap-5");
    // Same row box as the live pills in settings-nav.tsx.
    expect(html.match(/-mx-1 flex items-center gap-2 overflow-hidden px-1 py-1/g)).toHaveLength(2);

    // One pill per area, then one per screen of the first area (Shop).
    const groups = groupPanels(OWNER_PANELS);
    expect(pills(html)).toHaveLength(groups.length + groups[0].items.length);
    expect(groups.length).toBe(5);
    expect(groups[0].items.length).toBe(4);
  });

  it("draws the header without an icon tile, like the real PageHeader", () => {
    for (const simple of [true, false]) {
      const html = render(simple);
      expect(html).not.toContain("size-11");
      expect(html).toContain("h-[27px] w-36");
    }
  });

  it("Easy mode has no side rail", () => {
    const html = render(true);
    expect(html).not.toContain("lg:w-52");
    expect(html).not.toContain("lg:flex-row");
  });

  it("Easy mode keeps one line of text and two card blocks under the pills", () => {
    const html = render(true);
    expect(html).toContain("-mt-2");
    expect(html).toContain("h-[214px] rounded-lg");
    expect(html).toContain("h-72 rounded-lg");
  });

  it("Full mode keeps the side rail and has no pill rows", () => {
    const html = render(false);
    expect(html).toContain("lg:w-52");
    expect(html).toContain("lg:flex-row");
    expect(html).not.toContain("max-w-5xl");
    expect(pills(html)).toHaveLength(0);
    // One rail row per section: 4 + 2 + 1 + 5 + 2.
    expect(html.match(/h-8 w-28 rounded-md lg:w-full/g)).toHaveLength(OWNER_PANELS.length);
  });

  it("uses theme tokens only: no hex colours, no bare white", () => {
    for (const simple of [true, false]) {
      const html = render(simple);
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(html).not.toContain("bg-white");
    }
  });
});
