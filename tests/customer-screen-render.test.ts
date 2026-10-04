import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The menus and the device tiles only need these to exist; nothing runs here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/customers/cus_1",
}));
vi.mock("@/app/(app)/customers/actions", () => ({
  createAssetAction: vi.fn(),
  updateAssetAction: vi.fn(),
  deleteAssetAction: vi.fn(),
  deleteCustomerAction: vi.fn(),
}));

const { CustomerHeader, PinnedAction } = await import("@/components/customers/customer-header");
const { SummaryStrip } = await import("@/components/customers/summary-strip");
const { customerSummary } = await import("@/components/customers/customer-screen");
const { CustomerRepairs } = await import("@/components/customers/repair-rows");
const { CustomerInvoices } = await import("@/components/customers/document-rows");
const { AssetsCard } = await import("@/components/customers/assets-card");
const { CustomerActionsMenu } = await import("@/components/customers/customer-actions-menu");
const { MessageMenu } = await import("@/components/customers/message-menu");
const { InitialsVisual } = await import("@/components/ui/record-card");

const NOW = new Date(2026, 9, 3, 12, 0, 0);
const NOW_MS = Date.UTC(2026, 9, 3, 12, 0, 0);

const slot = (label: string) => React.createElement("button", { type: "button" }, label);

function header(props: Partial<React.ComponentProps<typeof CustomerHeader>> = {}): string {
  return renderToStaticMarkup(
    React.createElement(CustomerHeader, {
      visual: React.createElement(InitialsVisual, { name: "Elena Marquez" }),
      name: "Elena Marquez",
      business: null,
      phone: "(512) 555-0111",
      email: "elena@example.com",
      detailsHref: "/customers/cus_1?tab=details",
      newRepairHref: "/tickets/new?customerId=cus_1",
      newInvoiceHref: "/invoices/new?customerId=cus_1",
      bookHref: "/appointments",
      messageMenu: slot("Message"),
      moreMenu: slot("More"),
      ...props,
    }),
  );
}

/** Every <a> in the markup as [opening tag, inner markup]. */
function anchors(html: string): { open: string; inner: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({ open: match[1], inner: match[2] }));
}

describe("CustomerHeader", () => {
  it("shows the name, a very large tap-to-call number, a text button and the email", () => {
    const html = header();
    expect(html).toContain("Elena Marquez");
    expect(html).toContain('href="tel:5125550111"');
    expect(html).toContain("(512) 555-0111");
    expect(html).toContain('href="sms:5125550111"');
    expect(html).toContain("aria-label=\"Text (512) 555-0111\"");
    expect(html).toContain('href="mailto:elena@example.com"');
    // Very large: a 64px tall target with 24px digits.
    expect(anchors(html).find((link) => link.open.includes("tel:"))?.open).toMatch(/min-h-16/);
    expect(anchors(html).find((link) => link.open.includes("tel:"))?.open).toMatch(/text-2xl/);
  });

  it("has one black New repair action beside the New invoice, Book a visit, Message and More tiles", () => {
    const html = header();
    const links = anchors(html);
    const repair = links.find((link) => link.open.includes('href="/tickets/new?customerId=cus_1"'));
    expect(repair?.inner).toContain("New repair");
    // The one primary action is a default (black) Button; the tiles are not.
    expect(repair?.open).toContain('data-slot="button"');
    expect(links.find((link) => link.open.includes('href="/invoices/new?customerId=cus_1"'))?.inner).toContain("New invoice");
    expect(links.find((link) => link.open.includes('href="/appointments"'))?.inner).toContain("Book a visit");
    expect(html).toContain(">Message<");
    expect(html).toContain(">More<");
    expect(html.indexOf("New repair")).toBeLessThan(html.indexOf("New invoice"));
    expect(html.indexOf("New invoice")).toBeLessThan(html.indexOf("Book a visit"));
    // The black button leaves the panel on a phone (the pinned bar takes over).
    expect(repair?.open).toContain("max-sm:hidden");
  });

  it("puts the business name under the person's name", () => {
    const html = header({ name: "Ray Okonkwo", business: "Okonkwo Dental Group" });
    expect(html).toContain("Ray Okonkwo");
    expect(html.indexOf("Okonkwo Dental Group")).toBeGreaterThan(html.indexOf("<h1"));
    expect(html.indexOf("Okonkwo Dental Group")).toBeLessThan(html.indexOf("tel:"));
  });

  it("leaves the email out for a customer with only a phone", () => {
    const html = header({ email: null });
    expect(html).toContain('href="tel:5125550111"');
    expect(html).not.toContain("mailto:");
  });

  it("offers to add a number when there is no phone, and no dead call or text buttons", () => {
    const html = header({ phone: null, email: null });
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("sms:");
    expect(html).toContain("No phone number yet");
    expect(anchors(html).find((link) => link.inner.includes("Add a phone number"))?.open).toContain('href="/customers/cus_1?tab=details"');
  });

  it("is one panel: no coloured side stripe, no hex colours", () => {
    const html = header();
    expect(html).not.toMatch(/border-[lr]-/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // A heading the page can be navigated by.
    expect(html).toMatch(/<h1[^>]*>Elena Marquez<\/h1>/);
  });
});

describe("PinnedAction", () => {
  const html = renderToStaticMarkup(React.createElement(PinnedAction as React.ComponentType<{ href: string; children?: React.ReactNode }>, { href: "/tickets/new?customerId=cus_1" }, "New repair"));

  it("is the New repair button, for a phone only, just above the bottom tab bar", () => {
    expect(html).toContain('href="/tickets/new?customerId=cus_1"');
    expect(html).toContain("New repair");
    expect(html).toContain("sm:hidden");
    expect(html).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
  });
});

describe("SummaryStrip", () => {
  const render = (items: ReturnType<typeof customerSummary>, creditAction?: React.ReactNode) =>
    renderToStaticMarkup(React.createElement(SummaryStrip, { items, creditAction }));

  it("states each pair in words, with the money owed and the credit marked by their words", () => {
    const html = render(
      customerSummary({ openRepairs: 2, totalRepairs: 3, owedCents: 2705, creditCents: 3788, lastVisit: new Date(2026, 8, 29), customerSince: new Date(2026, 5, 4), now: NOW }),
    );
    for (const text of ["Open repairs", "2 open", "3 repairs in all", "Unpaid", "$27.05 owed", "Store credit", "$37.88 credit", "Last visit", "Sep 29", "Customer since Jun 4, 2026"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("<dt");
    expect(html).toContain("text-status-overdue-fg");
    expect(html).toContain("text-status-resolved-fg");
  });

  it("reads plainly for a customer with no repairs, no balance, no credit and no visits", () => {
    const html = render(customerSummary({ openRepairs: 0, totalRepairs: 0, owedCents: 0, creditCents: 0, lastVisit: null, now: NOW }));
    for (const text of ["None yet", "Nothing owed", "No credit", "No visits yet"]) expect(html).toContain(text);
    expect(html).not.toContain("text-status-overdue-fg");
    expect(html).not.toContain("$0.00");
  });

  it("hangs the Add credit control on the store-credit pair only", () => {
    const items = customerSummary({ openRepairs: 0, totalRepairs: 0, owedCents: 0, creditCents: 0, lastVisit: null, now: NOW });
    const html = render(items, React.createElement("button", { type: "button" }, "Add Credit"));
    expect(html.match(/Add Credit/g)).toHaveLength(1);
    expect(html.indexOf("Add Credit")).toBeGreaterThan(html.indexOf("Store credit"));
    expect(html.indexOf("Add Credit")).toBeLessThan(html.indexOf("Last visit"));
    expect(render(items)).not.toContain("Add Credit");
  });
});

const repair = (over: Partial<React.ComponentProps<typeof CustomerRepairs>["open"][number]> = {}) => ({
  id: "t1",
  number: 1013,
  subject: "Cracked screen",
  status: "In Progress",
  priority: "HIGH",
  dueDate: new Date(Date.UTC(2026, 9, 1)),
  createdAt: new Date(2026, 8, 21),
  asset: { type: "Phone", make: "Apple", model: "iPhone 14 Pro" },
  ...over,
});

describe("CustomerRepairs", () => {
  const render = (props: Partial<React.ComponentProps<typeof CustomerRepairs>>) =>
    renderToStaticMarkup(React.createElement(CustomerRepairs, { customerId: "cus_1", firstName: "Elena", open: [], earlier: [], total: 0, now: NOW_MS, ...props }));

  it("lists what is on the bench first, then the history, as cards that open the repair", () => {
    const html = render({ open: [repair()], earlier: [repair({ id: "t2", number: 1010, status: "Resolved", dueDate: null, subject: "Tempered glass" })], total: 2 });
    expect(html.indexOf("Open now")).toBeLessThan(html.indexOf("Earlier"));
    expect(html).toContain('href="/tickets/t1"');
    expect(html).toContain('href="/tickets/t2"');
    expect(html).toContain("#1013 · Cracked screen");
    expect(html).toContain("In Progress");
    expect(html).toMatch(/Overdue \dd/);
    expect(html).toContain("High priority");
    // The history says when it was opened; no "See all" when everything is shown.
    expect(html).toContain("Opened Sep 21");
    expect(html).not.toContain("See all");
  });

  it("says nothing is on the bench when only history exists", () => {
    const html = render({ earlier: [repair({ status: "Resolved", dueDate: null })], total: 1 });
    expect(html).toContain("Nothing on the bench right now.");
    expect(html).not.toContain("Open now");
  });

  it("offers a bigger list when there are more repairs than shown", () => {
    const html = render({ open: [repair()], total: 12 });
    expect(html).toContain("See all 12 repairs");
    expect(html).toContain('href="/tickets?customerId=cus_1&amp;status=all"');
  });

  it("gives a customer with no repairs a next step, not an empty box", () => {
    const html = render({ total: 0 });
    expect(html).toContain("No repairs yet");
    expect(html).toContain("Start the first repair for Elena.");
    expect(html).toContain('href="/tickets/new?customerId=cus_1"');
    expect(html).not.toContain("Open now");
  });
});

describe("CustomerInvoices", () => {
  const invoice = {
    id: "inv_1",
    number: 1014,
    status: "SENT",
    taxRateBps: 0,
    createdAt: new Date(Date.UTC(2026, 8, 18, 12)),
    dueDate: new Date(Date.UTC(2026, 9, 1)),
    paidAt: null,
    lines: [{ quantity: 1, unitPriceCents: 45_000, taxable: false }],
    payments: [],
  };
  const estimate = {
    id: "est_1",
    number: 1004,
    status: "CONVERTED",
    taxRateBps: 0,
    createdAt: new Date(Date.UTC(2026, 8, 20, 12)),
    expiresAt: null,
    approvedAt: new Date(Date.UTC(2026, 8, 22, 12)),
    lines: [{ quantity: 1, unitPriceCents: 30_207, taxable: false }],
  };
  const render = (props: Partial<React.ComponentProps<typeof CustomerInvoices>>) =>
    renderToStaticMarkup(
      React.createElement(CustomerInvoices, { customerId: "cus_1", invoices: [], invoiceTotal: 0, estimates: [], estimateTotal: 0, now: NOW_MS, ...props }),
    );

  it("shows each invoice as a card with its status and balance in words", () => {
    const html = render({ invoices: [invoice], invoiceTotal: 1 });
    expect(html).toContain('href="/invoices/inv_1"');
    expect(html).toContain("Invoice #1014");
    expect(html).toContain("Raised Sep 18");
    expect(html).toContain("due Oct 1");
    expect(html).toContain("Sent");
    expect(html).toContain("2 days overdue");
    expect(html).toContain("$450.00 due");
    expect(html).not.toContain("See all");
  });

  it("keeps the estimates, as their own group under the invoices", () => {
    const html = render({ invoices: [invoice], invoiceTotal: 1, estimates: [estimate], estimateTotal: 1 });
    expect(html.indexOf("Invoices")).toBeLessThan(html.indexOf("Estimates"));
    expect(html).toContain('href="/estimates/est_1"');
    expect(html).toContain("Estimate #1004");
    expect(html).toContain("Approved Sep 22");
    expect(html).toContain("Now an invoice");
    expect(html).toContain("$302.07");
  });

  it("links to the full list when there are more than shown", () => {
    const html = render({ invoices: [invoice], invoiceTotal: 9, estimates: [estimate], estimateTotal: 4 });
    expect(html).toContain("See all 9 invoices");
    expect(html).toContain('href="/invoices?customerId=cus_1"');
    expect(html).toContain("See all 4 estimates");
  });

  it("gives a customer with no invoices a next step", () => {
    const html = render({});
    expect(html).toContain("No invoices yet");
    expect(html).toContain('href="/invoices/new?customerId=cus_1"');
    expect(html).not.toContain("Estimates");
  });
});

describe("AssetsCard in Easy mode", () => {
  type Asset = { id: string; type: string; make: string | null; model: string | null; serial: string | null; password: string | null; notes: string | null };
  const asset: Asset = { id: "a1", type: "Laptop", make: "Apple", model: "MacBook Pro 13\"", serial: "C02ZK1TXQ05N", password: null, notes: "Coffee spill" };
  const render = (assets: Asset[], easy = true) => renderToStaticMarkup(React.createElement(AssetsCard, { customerId: "cus_1", assets, easy }));

  it("shows saved devices as picture tiles, with an Add a device tile last", () => {
    const html = render([asset]);
    expect(html).toContain("Apple MacBook Pro 13");
    expect(html).toContain("Laptop · C02ZK1TXQ05N");
    expect(html).toContain("Coffee spill");
    // A device picture on its white canvas.
    expect(html).toContain("laptop.webp");
    expect(html).toContain("bg-white");
    expect(html).toContain("Edit Apple MacBook Pro 13");
    expect(html.indexOf("Add a device")).toBeGreaterThan(html.indexOf("Apple MacBook Pro 13"));
  });

  it("uses an icon, not a made-up picture, for a device with no matching photo", () => {
    const html = render([{ ...asset, type: "Thing", make: null, model: "Widget", serial: null, notes: null }]);
    expect(html).toContain("Widget");
    expect(html).not.toContain(".webp");
    expect(html).not.toContain("bg-white");
  });

  it("says what devices are for when there are none", () => {
    const html = render([]);
    expect(html).toContain("No devices on file");
    expect(html).toContain("Add a device");
    expect(html).not.toContain("ticket");
  });

  it("keeps the Full card as it was", () => {
    const html = render([asset], false);
    expect(html).toContain("Devices");
    expect(html).toContain("Remove Apple MacBook Pro 13");
  });
});

describe("the two menu tiles", () => {
  it("makes Message a tile with the same shape as the link tiles", () => {
    const html = renderToStaticMarkup(
      React.createElement(MessageMenu, { options: [{ key: "text", label: "Text", detail: "(512) 555-0111", href: "sms:5125550111" }] }),
    );
    expect(html).toContain("Message");
    expect(html).toContain("min-h-20");
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("makes More a tile too, in the POS-style screen", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomerActionsMenu, { easy: true, tile: true, customerId: "cus_1", customerName: "Elena Marquez", canDelete: true, blockedReason: null }),
    );
    expect(html).toContain("More");
    expect(html).toContain("min-h-20");
    expect(html).not.toContain("h-14 px-5");
  });
});
