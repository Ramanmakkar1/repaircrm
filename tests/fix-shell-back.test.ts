import { describe, expect, it } from "vitest";
import { isAppScreen, isEntryForm, screenName, workspaceBack } from "@/lib/touch-workspace";
import { backTarget, pathOf, visit } from "@/components/shell/back-trail";

describe("Back with no earlier screen: the screen above this one", () => {
  it.each([
    ["/customers/c1/edit", "/customers/c1"],
    ["/customers/c1/statement", "/customers/c1"],
    ["/customers/c1", "/customers"],
    ["/inventory/vendors/v1", "/inventory/vendors"],
    ["/inventory/purchase-orders/p1", "/inventory/purchase-orders"],
    ["/inventory/purchase-orders/new", "/inventory/purchase-orders"],
    ["/invoices/recurring/r1", "/invoices/recurring"],
    ["/invoices/recurring/r1/edit", "/invoices/recurring/r1"],
    ["/invoices/i1/edit", "/invoices/i1"],
    ["/estimates/e1/edit", "/estimates/e1"],
    ["/marketing/m1/edit", "/marketing/m1"],
    ["/inventory/p1/label", "/inventory/p1"],
    ["/settings/integrations/xero-tenant", "/settings"],
    ["/tickets/new", "/tickets"],
    ["/pos/drawers", "/pos"],
  ])("%s goes back to %s", (from, to) => {
    expect(workspaceBack(from)).toBe(to);
  });

  it("goes Home from a first-level page, Home's hubs and Shop overview", () => {
    for (const path of ["/tickets", "/customers", "/invoices", "/inventory", "/reports", "/counter/invoices", "/dashboard"]) {
      expect(workspaceBack(path)).toBe("/counter");
    }
  });

  it("ignores the query and the hash when finding the parent", () => {
    expect(workspaceBack("/tickets/t1?tab=parts#notes")).toBe("/tickets");
  });

  it("sends an address it does not know to its area's list", () => {
    expect(workspaceBack("/marketing/campaigns/9")).toBe("/marketing");
    expect(workspaceBack("/nowhere")).toBe("/counter");
  });

  it("never mistakes a fixed word for a record id", () => {
    expect(isAppScreen("/inventory/vendors")).toBe(true);
    expect(workspaceBack("/inventory/vendors")).toBe("/inventory");
    expect(isEntryForm("/tickets/new")).toBe(true);
    expect(isEntryForm("/customers/c1/edit?x=1")).toBe(true);
    expect(isEntryForm("/customers/c1")).toBe(false);
  });
});

describe("Back says where it goes, in the shop's words", () => {
  it.each([
    ["/counter", "Home"],
    ["/tickets", "Repairs"],
    ["/tickets?status=Ready%20for%20Pickup", "Pickup"],
    ["/tickets?status=Ready+for+Pickup&q=x", "Pickup"],
    ["/tickets?due=overdue", "Repairs"],
    ["/tickets/t1", "Repair"],
    ["/customers/c1", "Customer"],
    ["/inventory", "Stock"],
    ["/inventory/p1", "Product"],
    ["/inventory/vendors", "Suppliers"],
    ["/inventory/vendors/v1", "Supplier"],
    ["/inventory/purchase-orders/p1", "Purchase order"],
    ["/leads", "Enquiries"],
    ["/leads/l1", "Enquiry"],
    ["/pos", "Sell"],
    ["/dashboard", "Shop overview"],
    ["/counter/invoices", "Invoices"],
    ["/counter/products", "Stock"],
    ["/settings/assistant", "Settings"],
    ["/invoices/recurring/r1", "Recurring bill"],
  ])("%s is called %s", (href, name) => {
    expect(screenName(href)).toBe(name);
  });
});

describe("the visit trail", () => {
  const walk = (...hrefs: string[]) => hrefs.reduce<string[]>((trail, href) => visit(trail, href), []);

  it("returns a repair to the filtered list it was opened from, filters and all", () => {
    const trail = walk("/counter", "/tickets", "/tickets?status=Waiting%20for%20Parts", "/tickets/t1");
    // A new filter on the same list replaces its entry: Back leaves the list instead of undoing one filter.
    expect(trail).toEqual(["/counter", "/tickets?status=Waiting%20for%20Parts", "/tickets/t1"]);
    expect(backTarget(trail, "/tickets/t1")).toBe("/tickets?status=Waiting%20for%20Parts");
  });

  it("returns a repair opened from the Pickup counter to the Pickup counter", () => {
    const trail = walk("/counter", "/tickets?status=Ready%20for%20Pickup", "/tickets/t9");
    expect(backTarget(trail, "/tickets/t9")).toBe("/tickets?status=Ready%20for%20Pickup");
  });

  it("returns a repair opened from a customer to that customer", () => {
    const trail = walk("/customers?q=marq", "/customers/c1", "/tickets/t1");
    expect(backTarget(trail, "/tickets/t1")).toBe("/customers/c1");
  });

  it("cuts the trail when a screen is visited again, so Back never ping-pongs", () => {
    const trail = walk("/counter", "/tickets?q=a", "/tickets/t1", "/tickets?q=a");
    expect(trail).toEqual(["/counter", "/tickets?q=a"]);
    expect(backTarget(trail, "/tickets")).toBe("/counter");
  });

  it("skips the entry form after saving: Back from a new repair goes where you started", () => {
    const trail = walk("/customers/c1", "/tickets/new", "/tickets/t2");
    expect(backTarget(trail, "/tickets/t2")).toBe("/customers/c1");
  });

  it("keeps a form as the target when you are in another form (add a customer mid-repair)", () => {
    const trail = walk("/counter", "/tickets/new", "/customers/new");
    expect(backTarget(trail, "/customers/new")).toBe("/tickets/new");
  });

  it("after Edit and Save, Back from the customer goes to the list it came from", () => {
    const trail = walk("/customers?q=ann", "/customers/c1", "/customers/c1/edit", "/customers/c1");
    expect(trail).toEqual(["/customers?q=ann", "/customers/c1"]);
    expect(backTarget(trail, "/customers/c1")).toBe("/customers?q=ann");
  });

  it("works while the new screen is not recorded yet (the trail's top is the screen before)", () => {
    const trail = walk("/counter", "/tickets?status=open");
    expect(backTarget(trail, "/tickets/t1")).toBe("/tickets?status=open");
  });

  it("falls back to the parent with no earlier screen (a bookmark, a fresh tab)", () => {
    expect(backTarget([], "/customers/c1/edit")).toBe("/customers/c1");
    expect(backTarget(["/tickets/t1"], "/tickets/t1")).toBe("/tickets");
    // Only forms before it: still the parent, never an empty form.
    expect(backTarget(walk("/tickets/new", "/tickets/t3"), "/tickets/t3")).toBe("/tickets");
  });

  it("ignores addresses that are not app screens", () => {
    expect(backTarget(["/login", "/tickets/t1"], "/tickets/t1")).toBe("/tickets");
  });

  it("keeps the last 30 screens", () => {
    const trail = walk(...Array.from({ length: 40 }, (_, index) => `/tickets/t${index}`));
    expect(trail).toHaveLength(30);
    expect(trail[29]).toBe("/tickets/t39");
    expect(pathOf("/tickets?x=1#y")).toBe("/tickets");
  });
});
