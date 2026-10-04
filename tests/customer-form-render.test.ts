import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form only needs the actions to exist; it never runs one here.
vi.mock("@/app/(app)/customers/actions", () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}));

const { CustomerForm } = await import("@/components/customers/customer-form");

/**
 * Switched-off sections of the customer form post nothing. On an EXISTING
 * customer that used to read as "blank" and wipe the stored notes, address,
 * tax settings and the rest on save. These render the form's first paint (a
 * section starts on only when it already holds something) and read what it
 * would post. Toggling a section off afterwards is covered by `keptFields`
 * in tests/intake.test.ts, which decides what a switched-off section posts.
 */

const customer = {
  id: "cus_1",
  firstName: "Anna",
  lastName: "Lopez",
  businessName: null,
  email: null,
  phone: null,
  mobile: "780-555-0142",
  address1: "12 Elm St",
  address2: null,
  city: "Edmonton",
  state: null,
  postalCode: null,
  referredBy: null,
  notes: null,
  smsOptIn: false,
  emailOptIn: true,
  taxExempt: false,
  taxRateId: null,
};

function posted(html: string): string[] {
  return [...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"/g)].map((match) => match[1]);
}

describe("CustomerForm — what a switched-off section posts", () => {
  it("posts the fields of a section that is off when editing, so saving cannot wipe them", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerForm, { customer, taxRates: [] }));

    // Notes, business and tax hold nothing yet, so they start switched off.
    expect(posted(html)).toEqual(expect.arrayContaining(["email", "businessName", "phone", "notes", "referredBy", "taxRateId"]));
    // The address section is showing, so its own inputs post it instead.
    expect(posted(html)).not.toContain("address1");
    expect(html).toContain('name="address1"');
  });

  it("sends nothing extra for a new customer", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerForm, { customer: null, taxRates: [] }));

    for (const name of ["email", "businessName", "phone", "notes", "referredBy", "taxRateId", "address1", "taxExempt"]) {
      expect(posted(html)).not.toContain(name);
    }
  });
});
