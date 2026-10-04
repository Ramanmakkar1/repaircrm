import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeadCards, type LeadCardRow } from "@/components/customers/lead-cards";
import { leadFacts, sourceLabel } from "@/components/customers/lead-facts";

const NOW = new Date(2026, 9, 3, 12, 0, 0);
const THREE_DAYS_AGO = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);

const lead: LeadCardRow = {
  id: "lead_1",
  name: "Marcus Hale",
  email: "m.hale@example.com",
  phone: "(512) 555-0191",
  source: "website",
  message: "Pixel 7 screen is cracked across the top.\n\nHow much?",
  status: "NEW",
  createdAt: THREE_DAYS_AGO,
  customerId: null,
  ticketId: null,
};

const render = (rows: LeadCardRow[]) => renderToStaticMarkup(React.createElement(LeadCards, { rows, now: NOW }));

describe("leadFacts", () => {
  it("says when it came in, where from, and what it became, in words", () => {
    expect(leadFacts({ source: "website", customerId: null, ticketId: null, createdAt: THREE_DAYS_AGO, now: NOW })).toEqual([
      "Received 3d ago",
      "Website",
    ]);
    expect(leadFacts({ source: "Phone", customerId: "c", ticketId: "t", createdAt: THREE_DAYS_AGO, now: NOW })).toEqual([
      "Received 3d ago",
      "Phone",
      "Customer and repair",
    ]);
  });

  it("names a link to a customer or to a repair on its own", () => {
    const base = { source: null, createdAt: THREE_DAYS_AGO, now: NOW };
    expect(leadFacts({ ...base, customerId: "c", ticketId: null }).at(-1)).toBe("Is a customer");
    expect(leadFacts({ ...base, customerId: null, ticketId: "t" }).at(-1)).toBe("Has a repair");
    expect(leadFacts({ ...base, customerId: null, ticketId: null })).toEqual(["Received 3d ago"]);
  });

  it("never gives more than three facts", () => {
    expect(leadFacts({ source: "x", customerId: "c", ticketId: "t", createdAt: THREE_DAYS_AGO, now: NOW }).length).toBeLessThanOrEqual(3);
  });
});

describe("sourceLabel", () => {
  it("capitalises free-text sources and drops blanks", () => {
    expect(sourceLabel("walk-in")).toBe("Walk-in");
    expect(sourceLabel("  ")).toBeNull();
    expect(sourceLabel(null)).toBeNull();
  });
});

describe("LeadCards", () => {
  it("links to the enquiry and shows the status as a word", () => {
    const html = render([lead]);
    expect(html).toContain('href="/leads/lead_1"');
    expect(html).toContain("Marcus Hale");
    expect(html).toContain(">New<");
    expect(html).toContain("(512) 555-0191");
    expect(html).toContain("Pixel 7 screen is cracked across the top. How much?");
  });

  it("keeps the tap-to-call link out of the card link", () => {
    const html = render([lead]);
    const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(links.some((link) => link[1].includes('href="tel:5125550191"'))).toBe(true);
    for (const link of links) expect(link[2]).not.toContain("<a ");
  });

  it("falls back to the email when there is no phone, with no call button", () => {
    const html = render([{ ...lead, phone: null }]);
    expect(html).toContain("m.hale@example.com");
    expect(html).not.toContain("tel:");
  });

  it("shows every status in its own word", () => {
    const html = render(
      (["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const).map((status, index) => ({ ...lead, id: `l${index}`, status })),
    );
    for (const word of ["New", "Contacted", "Converted", "Closed"]) expect(html).toContain(`>${word}<`);
  });
});
