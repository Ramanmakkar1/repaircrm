import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The settings shell reads the router; the markup is all these tests look at.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

const { SettingsHub } = await import("@/components/settings/settings-hub");
const { Switch } = await import("@/components/settings/settings-switch");
const { groupPanels, OWNER_PANELS, STAFF_PANELS } = await import(
  "@/components/settings/settings-panels"
);

/**
 * Settings navigation in Easy mode is the hub (components/settings/settings-hub.tsx):
 * every area at once, as picture tiles under five headings. (It replaced the
 * two rows of pills, whose second row only appeared after a first choice.)
 */
const hub = (panels: typeof OWNER_PANELS) =>
  renderToStaticMarkup(
    React.createElement(SettingsHub, { groups: groupPanels(panels), lines: {}, me: "Dana Ortiz" }),
  );

describe("Settings hub (Easy mode navigation)", () => {
  it("shows the five areas as headings, all at once", () => {
    const html = hub(OWNER_PANELS);
    expect(html).toContain('aria-label="Settings areas"');
    for (const area of ["Shop", "People", "Money", "Connections", "System"]) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${area}</h2>`));
    }
  });

  it("has one tile per screen, each a ?tab= link, so every old link still lands", () => {
    const html = hub(OWNER_PANELS);
    expect(html.match(/data-hub-tile="/g)).toHaveLength(OWNER_PANELS.length);
    for (const panel of OWNER_PANELS) expect(html).toContain(`href="/settings?tab=${panel.value}"`);
  });

  it("gives every tile a picture (initials for My profile) and a 96px-tall target", () => {
    const html = hub(OWNER_PANELS);
    expect(html).toContain("min-h-24");
    expect(html.match(/<img/g)?.length).toBe(OWNER_PANELS.length - 1);
    expect(html).toContain(">DO<");
  });

  it("shows staff their three screens with no headings", () => {
    const html = hub(STAFF_PANELS);
    expect(html).not.toContain("<h2");
    expect(html.match(/data-hub-tile="/g)).toHaveLength(3);
    for (const screen of ["My profile", "Saved replies", "Emails &amp; texts"]) expect(html).toContain(screen);
  });

  it("uses tokens only: white only behind the photos, no side stripes, no hex", () => {
    const html = hub(OWNER_PANELS);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/border-[lr]-/);
  });
});

describe("settings Switch", () => {
  it("is still a switch, one size up under the touch workspace", () => {
    const html = renderToStaticMarkup(
      React.createElement(Switch, { checked: true, "aria-label": "Publish the shop link" }),
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("in-data-[touch-workspace=true]:h-8");
    expect(html).toContain("in-data-[touch-workspace=true]:w-14");
    expect(html).not.toContain("bg-white");
  });
});
