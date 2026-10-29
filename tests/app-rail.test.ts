import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { railGroups } from "@/components/shell/rail-items";

const hrefs = (role: string) => railGroups(role).flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));

describe("Full view's grouped rail", () => {
  it("reaches every area in four named groups", () => {
    expect(railGroups("OWNER").map((group) => group.label)).toEqual(["Counter", "Sales & payments", "Stock & purchasing", "Shop management"]);
    for (const href of ["/tickets", "/appointments", "/customers", "/leads", "/pos", "/invoices", "/invoices/recurring", "/estimates", "/inventory", "/inventory/purchase-orders", "/inventory/vendors", "/dashboard", "/reports", "/time-clock", "/marketing", "/display", "/settings"]) {
      expect(hrefs("OWNER")).toContain(href);
    }
  });

  it("shows a technician no money areas and no owner-only pages", () => {
    const tech = hrefs("TECH");
    for (const href of ["/pos", "/invoices", "/estimates", "/inventory/vendors", "/pos/drawers"]) expect(tech).not.toContain(href);
    expect(tech).toContain("/tickets");
  });

  it("uses the app's one vocabulary", () => {
    const labels = railGroups("OWNER").flatMap((group) => group.items.flatMap((item) => [item.label, ...(item.children ?? []).map((child) => child.label)]));
    for (const word of ["Leads", "Inventory", "Vendors", "Point of sale", "Dashboard", "Recurring bills"]) expect(labels).not.toContain(word);
  });

  it("is in the shell: the rail in Full, the slim rail in Easy, and the bottom bar kept to lg in Easy", () => {
    const shell = fs.readFileSync(path.resolve(__dirname, "../components/shell/app-shell.tsx"), "utf8");
    expect(shell).toContain("<SlimRail");
    expect(shell).toContain("<GroupedRail");
    const bar = fs.readFileSync(path.resolve(__dirname, "../components/shell/mobile-navigation.tsx"), "utf8");
    expect(bar).toContain('simple ? "lg:hidden" : "md:hidden"');
    expect(bar).not.toContain("sm:hidden");
  });
});
