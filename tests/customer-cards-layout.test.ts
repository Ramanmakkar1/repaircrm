import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerCards, type CustomerCardRow } from "@/components/customers/customer-cards";
import { LeadCards, type LeadCardRow } from "@/components/customers/lead-cards";

const NOW = new Date(2026, 9, 3, 12, 0, 0);

const customer: CustomerCardRow = {
  id: "cus_1",
  name: "Elena Marquez",
  businessName: null,
  email: null,
  phone: "(512) 555-0110",
  mobile: null,
  openRepairs: 1,
  owedCents: 0,
  lastVisit: null,
};

const lead: LeadCardRow = {
  id: "lead_1",
  name: "Marcus Hale",
  email: null,
  phone: "(512) 555-0191",
  source: null,
  message: null,
  status: "NEW",
  createdAt: new Date(2026, 9, 1),
  customerId: null,
  ticketId: null,
};

/** The class list of the <a> that points at `href`. */
function linkClasses(html: string, href: string): string {
  const match = html.match(new RegExp(`<a\\b[^>]*href="${href}"[^>]*>`));
  const klass = match?.[0].match(/class="([^"]*)"/);
  return klass?.[1] ?? "";
}

describe("card height in a grid row", () => {
  // The grid stretches each <li> to the tallest card in its row. The call
  // button is centred on the <li>, so the card link has to fill the <li> or
  // the button sits below the card's own centre and the card ends short.
  it("makes the customer card fill its list item, so the call button is centred on the card", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerCards, { rows: [customer], now: NOW }));
    expect(linkClasses(html, "/customers/cus_1").split(/\s+/)).toContain("h-full");
    expect(html).toContain("top-1/2");
  });

  it("makes the enquiry card fill its list item, so the call button is centred on the card", () => {
    const html = renderToStaticMarkup(React.createElement(LeadCards, { rows: [lead], now: NOW }));
    expect(linkClasses(html, "/leads/lead_1").split(/\s+/)).toContain("h-full");
    expect(html).toContain("top-1/2");
  });
});
