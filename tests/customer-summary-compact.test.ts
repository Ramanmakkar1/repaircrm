import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CUSTOMER_SECTIONS_ID, customerSummary, customerTabs } from "@/components/customers/customer-screen";
import { SummaryStrip } from "@/components/customers/summary-strip";
import { CustomerHeader } from "@/components/customers/customer-header";
import { InitialsVisual } from "@/components/ui/record-card";

/**
 * The phone's first screen is the header and the summary strip, so both are
 * kept short there and the section tabs start high enough to show the first
 * card above the pinned "New repair" bar. These pin the shape that does it.
 */

const NOW = new Date(2026, 9, 3, 12, 0, 0);
const items = customerSummary({ openRepairs: 2, totalRepairs: 3, owedCents: 2705, creditCents: 3788, lastVisit: new Date(2026, 8, 29), customerSince: new Date(2026, 5, 4), now: NOW });
const addCredit = React.createElement("button", { type: "button" }, "Add Credit");
const strip = (creditAction?: React.ReactNode) => renderToStaticMarkup(React.createElement(SummaryStrip, { items, creditAction }));

/** The opening tag of the wrapper div that holds the pair with this label. */
function pairTag(html: string, label: string): string {
  const at = html.indexOf(`>${label}</dt>`);
  const open = html.lastIndexOf("<div", at);
  return html.slice(open, html.indexOf(">", open) + 1);
}

describe("SummaryStrip on a phone", () => {
  it("puts repairs, owed and last visit on one row and gives store credit the row under them", () => {
    const html = strip(addCredit);
    expect(html).toMatch(/<dl[^>]*\bgrid-cols-3\b/);
    // Three across on a phone, four from a tablet up, the credit pair wider because of its button.
    expect(html).toContain("sm:grid-cols-[1fr_1fr_1.6fr_1.15fr]");
    expect(pairTag(html, "Store credit")).toContain("max-sm:order-last");
    expect(pairTag(html, "Store credit")).toContain("max-sm:col-span-3");
    for (const label of ["Open repairs", "Unpaid", "Last visit"]) {
      expect(pairTag(html, label)).not.toContain("order-last");
      expect(pairTag(html, label)).not.toContain("col-span");
    }
  });

  it("keeps the document order the same as before, so a screen reader reads the pairs as they always did", () => {
    const html = strip(addCredit);
    const at = (text: string) => html.indexOf(text);
    expect(at("Open repairs")).toBeLessThan(at("Unpaid"));
    expect(at("Unpaid")).toBeLessThan(at("Store credit"));
    expect(at("Store credit")).toBeLessThan(at("Last visit"));
  });

  it("puts the Add credit button beside the amount on a phone, in a cell of its own, and renders it once", () => {
    const html = strip(addCredit);
    expect(html.match(/Add Credit/g)).toHaveLength(1);
    const amountEnd = html.indexOf("$37.88 credit");
    const button = html.indexOf("Add Credit");
    expect(button).toBeGreaterThan(amountEnd);
    // The button's cell is the second column and spans the label and the amount rows.
    const cell = html.slice(html.lastIndexOf("<dd", button), button);
    expect(cell).toContain("col-start-2");
    expect(cell).toContain("row-span-2");
    // It is a sibling of the amount, never nested in it, and the strip stays valid dl/dt/dd markup.
    expect(html.slice(amountEnd, button)).toMatch(/<\/dd><dd/);
    expect(html).not.toMatch(/<dd[^>]*><dd/);
  });

  it("shrinks the figures on a phone and restores them from a tablet up", () => {
    const html = strip(addCredit);
    expect(html).toMatch(/text-\[15px\] font-semibold[^"]*sm:text-xl/);
    expect(html).toMatch(/text-xs text-muted-foreground sm:text-sm/);
    expect(html).toMatch(/<dl[^>]*\bp-3\b[^>]*\bsm:p-5\b/);
  });

  it("is still just words and tokens: no hex colours, no side stripes", () => {
    const html = strip(addCredit);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/border-[lr]-/);
  });

  it("works for a technician (no credit control): the credit pair is plain words and the strip is four across", () => {
    const html = strip();
    expect(html).not.toContain("Add Credit");
    expect(html).toContain("sm:grid-cols-4");
    expect(html).not.toContain("1.6fr");
    expect(html).toContain("$37.88 credit");
    expect(html).not.toMatch(/<dd[^>]*><\/dd>/);
  });

  it("states a quiet customer in plain words on the same layout", () => {
    const quiet = customerSummary({ openRepairs: 0, totalRepairs: 0, owedCents: 0, creditCents: 0, lastVisit: null, now: NOW });
    const html = renderToStaticMarkup(React.createElement(SummaryStrip, { items: quiet, creditAction: addCredit }));
    for (const text of ["None yet", "Nothing owed", "No credit", "No visits yet"]) expect(html).toContain(text);
    expect(pairTag(html, "Store credit")).toContain("max-sm:order-last");
  });
});

describe("CustomerHeader on a phone", () => {
  const header = renderToStaticMarkup(
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
      messageMenu: React.createElement("button", { type: "button" }, "Message"),
      moreMenu: React.createElement("button", { type: "button" }, "More"),
    }),
  );

  it("is a tighter panel on a phone and the roomy one from a tablet up", () => {
    expect(header).toMatch(/<section[^>]*\bp-3\b[^>]*\bsm:p-6\b/);
    expect(header).toMatch(/<section[^>]*\bgap-4\b[^>]*\bsm:gap-5\b/);
  });

  it("keeps the email a 48px tap target while taking only a line of height on a phone", () => {
    const link = header.match(/<a[^>]*href="mailto:elena@example.com"[^>]*>/)?.[0] ?? "";
    expect(link).toContain("min-h-12");
    expect(link).toContain("data-touch-control");
    expect(link).toContain("max-sm:-my-3");
  });

  it("keeps who they are and the phone number side by side only from lg, so a portrait tablet never squeezes the name to a letter a line", () => {
    expect(header).toContain("lg:flex-row");
    expect(header).not.toContain("sm:flex-row");
    // The number and Text still share a row of their own under the name until then.
    expect(header).toMatch(/<a[^>]*tel:5125550111[^>]*\bflex-1\b[^>]*\blg:flex-none\b/);
    expect(header).toMatch(/lg:shrink-0 lg:flex-nowrap/);
  });

  it("still has the very large call button and the four tiles", () => {
    expect(header).toMatch(/<a[^>]*tel:5125550111[^>]*min-h-16/);
    expect(header).toContain("New invoice");
    expect(header).toContain("Book a visit");
  });
});

describe("the section tabs reveal their list", () => {
  it("links every tab to the one id the page puts on the tab row", () => {
    const tabs = customerTabs({ customerId: "cus_9", active: "devices", counts: { repairs: 0, invoices: 0, devices: 2 } });
    expect(CUSTOMER_SECTIONS_ID).toMatch(/^[a-z][a-z-]*$/);
    for (const tab of tabs) expect(tab.href.endsWith(`#${CUSTOMER_SECTIONS_ID}`)).toBe(true);
    // The hash is the only addition: the section is still chosen by ?tab=.
    expect(tabs.map((tab) => tab.href.split("#")[0])).toEqual(["/customers/cus_9", "/customers/cus_9?tab=invoices", "/customers/cus_9?tab=devices", "/customers/cus_9?tab=details"]);
  });
});
