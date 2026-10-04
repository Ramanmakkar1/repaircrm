import { describe, expect, it } from "vitest";

import { attentionBorder } from "@/components/settings/card-attention";
import {
  groupOf,
  groupPanels,
  hasGroupLabels,
  OWNER_PANELS,
  panelsForRole,
  resolvePanel,
  STAFF_PANELS,
  tabFromHref,
} from "@/components/settings/settings-panels";

/**
 * `?tab=` values are public: bookmarks, the Connect panel's links and the OAuth
 * redirects all point at them. These pin the list so a restyle of the
 * navigation can never quietly rename or drop a section.
 */
describe("Settings sections", () => {
  it("keeps every owner section and its ?tab= value, in order", () => {
    expect(OWNER_PANELS.map((panel) => panel.value)).toEqual([
      "shop",
      "workflow",
      "locations",
      "canned",
      "team",
      "profile",
      "payments",
      "connect",
      "messaging",
      "checkin",
      "integrations",
      "api-keys",
      "automation",
      "audit",
    ]);
  });

  it("gives every section a label, a one-line explanation and an icon", () => {
    for (const panel of OWNER_PANELS) {
      expect(panel.label.length).toBeGreaterThan(0);
      expect(panel.blurb.length).toBeGreaterThan(10);
      expect(panel.icon).toBeTruthy();
    }
  });

  it("shows staff only profile, canned responses and messaging, profile first", () => {
    expect(STAFF_PANELS.map((panel) => panel.value)).toEqual(["profile", "canned", "messaging"]);
    expect(panelsForRole("TECH")).toBe(STAFF_PANELS);
    expect(panelsForRole("FRONT_DESK")).toBe(STAFF_PANELS);
    expect(panelsForRole("OWNER")).toBe(OWNER_PANELS);
  });
});

describe("Settings areas", () => {
  it("groups an owner's sections into the five named areas", () => {
    const groups = groupPanels(OWNER_PANELS);
    expect(groups.map((group) => group.label)).toEqual([
      "Shop",
      "People",
      "Money",
      "Connections",
      "System",
    ]);
    expect(groups.map((group) => group.items.map((panel) => panel.value))).toEqual([
      ["shop", "workflow", "locations", "canned"],
      ["team", "profile"],
      ["payments"],
      ["connect", "messaging", "checkin", "integrations", "api-keys"],
      ["automation", "audit"],
    ]);
  });

  it("loses no section when grouping", () => {
    const grouped = groupPanels(OWNER_PANELS).flatMap((group) => group.items);
    expect(grouped).toHaveLength(OWNER_PANELS.length);
  });

  it("puts three staff sections in one unlabelled group", () => {
    expect(hasGroupLabels(STAFF_PANELS)).toBe(false);
    expect(groupPanels(STAFF_PANELS)).toEqual([{ label: "", items: STAFF_PANELS }]);
  });

  it("finds the area a section is in, and falls back to the first", () => {
    const groups = groupPanels(OWNER_PANELS);
    expect(groupOf(groups, "api-keys").label).toBe("Connections");
    expect(groupOf(groups, "payments").label).toBe("Money");
    expect(groupOf(groups, "nonsense").label).toBe("Shop");
  });
});

describe("resolvePanel", () => {
  it("opens the requested section when this role has it", () => {
    expect(resolvePanel(OWNER_PANELS, "audit")).toBe("audit");
    expect(resolvePanel(STAFF_PANELS, "messaging")).toBe("messaging");
  });

  it("falls back to the first section for an unknown, empty or not-allowed value", () => {
    expect(resolvePanel(OWNER_PANELS, "")).toBe("shop");
    expect(resolvePanel(OWNER_PANELS, "does-not-exist")).toBe("shop");
    // A technician following an owner's ?tab=payments link lands on My profile.
    expect(resolvePanel(STAFF_PANELS, "payments")).toBe("profile");
  });
});

describe("tabFromHref", () => {
  it("reads a plain same-page tab link", () => {
    expect(tabFromHref("/settings?tab=checkin", "/settings")).toBe("checkin");
    expect(tabFromHref("/settings?tab=api-keys", "/settings")).toBe("api-keys");
  });

  it("leaves every other link to a real navigation", () => {
    expect(tabFromHref("/settings?tab=integrations&connected=xero", "/settings")).toBeNull();
    expect(tabFromHref("/settings", "/settings")).toBeNull();
    expect(tabFromHref("/settings?other=1", "/settings")).toBeNull();
    expect(tabFromHref("/tickets?tab=shop", "/settings")).toBeNull();
    expect(tabFromHref("/settings?tab=shop#top", "/settings")).toBeNull();
    expect(tabFromHref("https://example.com/settings?tab=shop", "/settings")).toBeNull();
    expect(tabFromHref("//evil.example/settings?tab=shop", "/settings")).toBeNull();
    expect(tabFromHref(null, "/settings")).toBeNull();
    expect(tabFromHref("", "/settings")).toBeNull();
  });
});

describe("attentionBorder", () => {
  it("tints the whole border for the tones that need something doing", () => {
    expect(attentionBorder("danger")).toBe("border-status-overdue/50");
    expect(attentionBorder("active")).toBe("border-status-in-progress/50");
    expect(attentionBorder("waiting")).toBe("border-status-waiting/50");
  });

  it("stays quiet for everything else, and never paints a side stripe", () => {
    for (const tone of ["neutral", "info", "ready", "success", undefined] as const) {
      expect(attentionBorder(tone)).toBeUndefined();
    }
    for (const tone of ["danger", "active", "waiting"] as const) {
      expect(attentionBorder(tone)).not.toMatch(/border-[lr]-/);
    }
  });
});
