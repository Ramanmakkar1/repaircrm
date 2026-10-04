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

/** Counts the hub tile blocks in a markup string. */
const tiles = (html: string) => html.match(/data-hub-tile-skeleton=""/g) ?? [];

describe("SettingsSkeleton (loading state)", () => {
  it("Easy mode draws the centred column with the hub: five areas, one tile per screen", () => {
    const html = render(true);
    // Same wrapper the page uses in Easy mode.
    expect(html).toContain("mx-auto flex w-full max-w-5xl flex-col gap-5");
    // Same grid as the live hub (settings-hub.tsx), one grey tile per real tile.
    const groups = groupPanels(OWNER_PANELS);
    expect(groups.length).toBe(5);
    expect(html.match(/grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3/g)).toHaveLength(groups.length);
    expect(tiles(html)).toHaveLength(OWNER_PANELS.length);
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

  it("Easy mode tiles are the live tile's height and shape", () => {
    const html = render(true);
    expect(html).toContain("h-24 rounded-2xl");
  });

  it("Full mode keeps the side rail and has no hub tiles", () => {
    const html = render(false);
    expect(html).toContain("lg:w-52");
    expect(html).toContain("lg:flex-row");
    expect(html).not.toContain("max-w-5xl");
    expect(tiles(html)).toHaveLength(0);
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
