import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The settings shell reads the router; the markup is all these tests look at.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

const { Tabs } = await import("@/components/ui/tabs");
const { SettingsPillNav } = await import("@/components/settings/settings-nav");
const { Switch } = await import("@/components/settings/settings-switch");
const { groupPanels, OWNER_PANELS, STAFF_PANELS } = await import(
  "@/components/settings/settings-panels"
);

const nav = (panels: typeof OWNER_PANELS, value: string) =>
  renderToStaticMarkup(
    React.createElement(
      Tabs,
      { value },
      React.createElement(SettingsPillNav, {
        groups: groupPanels(panels),
        value,
        onSelect: () => {},
      }),
    ),
  );

describe("SettingsPillNav (Easy mode)", () => {
  it("shows the five areas, with the current one marked and filled", () => {
    const html = nav(OWNER_PANELS, "messaging");
    expect(html).toContain('aria-label="Settings areas"');
    for (const area of ["Shop", "People", "Money", "Connections", "System"]) {
      expect(html).toContain(`>${area}</button>`);
    }
    // Exactly one area is current, and it is Connections (where Messaging lives).
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*>Connections</);
  });

  it("offers only the screens of the current area", () => {
    const html = nav(OWNER_PANELS, "messaging");
    for (const screen of ["Connect", "Messaging", "Check-in &amp; reviews", "Integrations", "API &amp; webhooks"]) {
      expect(html).toContain(`>${screen}</button>`);
    }
    expect(html).not.toContain(">Workflow</button>");
    expect(html).not.toContain(">Audit log</button>");
    expect(html).toMatch(/aria-selected="true"[^>]*>Messaging</);
  });

  it("keeps a one-screen area (Money) reachable and named", () => {
    const html = nav(OWNER_PANELS, "payments");
    expect(html).toMatch(/aria-current="true"[^>]*>Money</);
    expect(html).toMatch(/aria-selected="true"[^>]*>Payments</);
  });

  it("uses the big pill look: 44px+ targets, rounded, tokens only", () => {
    const html = nav(OWNER_PANELS, "shop");
    expect(html).toContain("min-h-11");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("border-accent bg-accent text-accent-foreground");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain("bg-white");
    expect(html).not.toMatch(/border-[lr]-/);
  });

  it("shows staff one row of three screens and no area row", () => {
    const html = nav(STAFF_PANELS, "profile");
    expect(html).not.toContain('aria-label="Settings areas"');
    for (const screen of ["My profile", "Canned responses", "Messaging"]) {
      expect(html).toContain(`>${screen}</button>`);
    }
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
