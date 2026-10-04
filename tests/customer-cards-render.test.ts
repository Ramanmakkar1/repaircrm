import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BigPager } from "@/components/customers/big-pager";
import { CustomerCards, type CustomerCardRow } from "@/components/customers/customer-cards";
import { DetailHero } from "@/components/customers/detail-hero";

const NOW = new Date(2026, 9, 3, 12, 0, 0);

const row: CustomerCardRow = {
  id: "cus_1",
  name: "Elena Marquez",
  businessName: null,
  email: "elena@example.com",
  phone: null,
  mobile: "(512) 555-0110",
  openRepairs: 2,
  owedCents: 2705,
  lastVisit: new Date(2026, 8, 29),
};

function render(rows: CustomerCardRow[]): string {
  return renderToStaticMarkup(React.createElement(CustomerCards, { rows, now: NOW }));
}

/** Every <a> in the markup, with the markup that sits inside it. */
function anchors(html: string): { open: string; inner: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({ open: match[1], inner: match[2] }));
}

describe("CustomerCards", () => {
  it("links the card to the customer and states the facts in words", () => {
    const html = render([row]);
    expect(html).toContain('href="/customers/cus_1"');
    expect(html).toContain("Elena Marquez");
    expect(html).toContain("(512) 555-0110");
    expect(html).toContain("elena@example.com");
    expect(html).toContain("2 open repairs");
    expect(html).toContain("$27.05 owed");
    expect(html).toContain("Last visit Sep 29");
  });

  it("offers tap-to-call as a sibling of the card link, never inside it", () => {
    const html = render([row]);
    const links = anchors(html);
    const call = links.find((link) => link.open.includes('href="tel:5125550110"'));
    expect(call).toBeTruthy();
    // No <a> is nested in another <a>.
    for (const link of links) expect(link.inner).not.toContain("<a ");
    // The card link itself must not contain the tel link.
    const card = links.find((link) => link.open.includes('href="/customers/cus_1"'));
    expect(card?.inner).not.toContain("tel:");
    // And it names who it calls, because the icon alone says nothing.
    expect(call?.open).toContain("Call Elena Marquez");
  });

  it("leaves the call button off when there is no number", () => {
    const html = render([{ ...row, phone: null, mobile: null }]);
    expect(html).not.toContain("tel:");
  });

  it("shows the business as a second line and keeps a quiet card quiet", () => {
    const html = render([
      { ...row, businessName: "Okonkwo Dental", openRepairs: 0, owedCents: 0, lastVisit: null },
    ]);
    expect(html).toContain("Okonkwo Dental");
    expect(html).not.toContain("open repair");
    expect(html).not.toContain("owed");
    expect(html).not.toContain("Last visit");
  });

  it("uses an icon, not 'C5' initials, for a quick-added customer", () => {
    const html = render([{ ...row, name: "Customer 5125550199", email: null }]);
    expect(html).toContain("Customer 5125550199");
    expect(html).not.toContain(">C5<");
  });
});

describe("BigPager", () => {
  it("shows only the summary when there is a single page", () => {
    const html = renderToStaticMarkup(
      React.createElement(BigPager, { page: 1, pageCount: 1, previousHref: "/customers", nextHref: "/customers?page=2", summary: "1–9 of 9 customers" }),
    );
    expect(html).toContain("1–9 of 9 customers");
    expect(html).not.toContain("Previous");
  });

  it("disables Previous on the first page and keeps the URL contract for Next", () => {
    const html = renderToStaticMarkup(
      React.createElement(BigPager, { page: 1, pageCount: 3, previousHref: "/customers", nextHref: "/customers?q=al&page=2", summary: "1–25 of 60 customers" }),
    );
    expect(html).toContain("Page 1 of 3");
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Previous"|<button[^>]*aria-label="Previous"[^>]*disabled/);
    expect(html).toContain('href="/customers?q=al&amp;page=2"');
  });
});

describe("DetailHero", () => {
  it("makes the phone a big tap-to-call link and lays facts out as label/value pairs", () => {
    const html = renderToStaticMarkup(
      React.createElement(DetailHero, {
        title: "Elena Marquez",
        phone: "(512) 555-0110",
        facts: [{ label: "Owes", value: "$27.05", tone: "alert" }],
        primary: React.createElement("a", { href: "/tickets/new?customerId=cus_1" }, "New repair"),
      }),
    );
    expect(html).toContain('href="tel:5125550110"');
    expect(html).toContain("<dt");
    expect(html).toContain("Owes");
    expect(html).toContain("$27.05");
    expect(html).toContain("New repair");
    // One panel: no coloured side stripe.
    expect(html).not.toMatch(/border-[lr]-/);
  });

  it("renders no phone link when there is no number", () => {
    const html = renderToStaticMarkup(React.createElement(DetailHero, { title: "Elena Marquez", phone: null }));
    expect(html).not.toContain("tel:");
  });
});
