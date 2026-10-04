import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  SECTIONS,
  SECTION_FIELDS,
  displayName,
  hasNameOrNumber,
  initialSections,
  initialValues,
  keptFields,
  openSections,
  summaryRows,
  textsFollowNumber,
  type CustomerFormValues,
  type Section,
} from "@/lib/customers/form-sections";

// The form only needs the actions to exist; it never runs one here.
vi.mock("@/app/(app)/customers/actions", () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}));

const { CustomerForm } = await import("@/components/customers/customer-form");

/**
 * Easy-mode customer quick add: the pure helpers it is made of, and what its
 * first paint puts on screen and would post. Full mode (no `simple`) keeps the
 * form it always was; tests/customer-form-render.test.ts covers that one.
 */

const customer: CustomerFormValues = {
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

const closed: Record<Section, boolean> = { email: false, address: false, business: false, notes: false, tax: false };
const empty = initialValues(null);

const posted = (html: string) => [...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"/g)].map((match) => match[1]);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const easy = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(CustomerForm, { customer: null, taxRates: [], simple: true, ...props }));
/** The whole <input …> tag with this id. */
const input = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
const tile = (html: string, title: string) => html.match(new RegExp(`<button[^>]*aria-pressed="(?:true|false)"[^>]*>(?:(?!</button>)[\\s\\S])*${title}[\\s\\S]*?</button>`))?.[0] ?? "";

describe("displayName: who the picture and the summary call this customer", () => {
  it("is empty until a name or a number is typed", () => {
    expect(displayName({ name: "", mobile: "" })).toBe("");
    expect(displayName({ name: "   ", mobile: "  " })).toBe("");
  });

  it("prefers the typed name and tidies its spaces", () => {
    expect(displayName({ name: "  Sarah   Patel ", mobile: "512-555-0111" })).toBe("Sarah Patel");
  });

  it("is how the shop will list a phone-only customer: Customer + the number", () => {
    expect(displayName({ name: "", mobile: " 512-555-0111 " })).toBe("Customer 512-555-0111");
  });
});

describe("hasNameOrNumber: the save rule, worded as a hint", () => {
  it("is satisfied by a name or a mobile number", () => {
    expect(hasNameOrNumber({ ...empty, name: "Sarah" }, false)).toBe(true);
    expect(hasNameOrNumber({ ...empty, mobile: "512" }, false)).toBe(true);
    expect(hasNameOrNumber(empty, false)).toBe(false);
    expect(hasNameOrNumber({ ...empty, name: "  ", mobile: " " }, false)).toBe(false);
  });

  it("counts the office phone only when it is posted", () => {
    expect(hasNameOrNumber({ ...empty, phone: "512-555-0110" }, false)).toBe(false);
    expect(hasNameOrNumber({ ...empty, phone: "512-555-0110" }, true)).toBe(true);
  });
});

describe("textsFollowNumber: text updates turn on with a real-looking number", () => {
  it("needs seven digits, whatever the punctuation", () => {
    expect(textsFollowNumber("")).toBe(false);
    expect(textsFollowNumber("555-01")).toBe(false);
    expect(textsFollowNumber("555-0142")).toBe(true);
    expect(textsFollowNumber("(512) 555-0111")).toBe(true);
  });
});

describe("sections: what starts open, what a validation error opens", () => {
  it("starts every section closed for a new customer", () => {
    expect(initialSections(empty)).toEqual(closed);
  });

  it("starts a section open only when the customer already holds something in it", () => {
    const values = initialValues({ ...customer, email: "a@b.co", notes: "VIP", taxExempt: true });
    expect(initialSections(values)).toEqual({ email: true, address: true, business: false, notes: true, tax: true });
  });

  it("opens a closed section whose field has an error, and leaves the rest alone", () => {
    expect(openSections(closed, { email: "Enter a valid email address" })).toEqual({ ...closed, email: true });
    expect(openSections(closed, { name: "Add a name or a phone number" })).toEqual(closed);
    expect(openSections({ ...closed, notes: true }, {})).toEqual({ ...closed, notes: true });
  });

  it("lists every optional section once, each with its own fields", () => {
    expect([...SECTIONS].sort()).toEqual(Object.keys(SECTION_FIELDS).sort());
    const fields = SECTIONS.flatMap((section) => SECTION_FIELDS[section]);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("still posts a closed section's stored values when editing", () => {
    const values = initialValues({ ...customer, notes: "VIP", referredBy: "Google" });
    expect(keptFields(SECTION_FIELDS, { ...closed, address: true }, values).map((field) => field.name)).toEqual(
      expect.arrayContaining(["notes", "referredBy", "email", "businessName", "phone", "taxRateId"]),
    );
    expect(keptFields(SECTION_FIELDS, { ...closed, address: true }, values).map((field) => field.name)).not.toContain("address1");
  });

  it("shows a phone-only customer with an empty name box", () => {
    const values = initialValues({ ...customer, firstName: "Customer", lastName: "780-555-0142" });
    expect(values.name).toBe("");
    expect(initialValues(customer).name).toBe("Anna Lopez");
  });
});

describe("summaryRows: the rows under 'This customer'", () => {
  it("is only the text-update state while every section is closed", () => {
    expect(summaryRows(empty, closed)).toEqual([{ label: "Text updates", value: "Off" }]);
    expect(summaryRows({ ...empty, smsOptIn: true }, closed)).toEqual([{ label: "Text updates", value: "On" }]);
  });

  it("adds one row per open section, empty when nothing is typed in it yet", () => {
    const rows = summaryRows(empty, { ...closed, email: true, address: true });
    expect(rows.map((row) => row.label)).toEqual(["Text updates", "Email", "Address"]);
    expect(rows.slice(1).every((row) => row.value === "")).toBe(true);
  });

  it("writes an address, a business, notes and the tax choice on one line each", () => {
    const values = {
      ...empty,
      address1: "12 Elm St",
      address2: "Apt 4",
      city: "Edmonton",
      state: "AB",
      postalCode: "T5J 0N3",
      businessName: "Acme",
      phone: "780-555-0110",
      notes: "Prefers texts",
      referredBy: "Google",
    };
    const all = { email: false, address: true, business: true, notes: true, tax: true };
    const byLabel = Object.fromEntries(summaryRows(values, all).map((row) => [row.label, row.value]));
    expect(byLabel.Address).toBe("12 Elm St, Apt 4, Edmonton AB T5J 0N3");
    expect(byLabel.Business).toBe("Acme · 780-555-0110");
    expect(byLabel.Notes).toBe("Prefers texts · Google");
    expect(byLabel.Tax).toBe("Shop default");
  });

  it("names the tax rate, or says exempt", () => {
    const rates = [{ id: "r1", name: "Reduced", rateBps: 500, isDefault: false, active: true }];
    const open = { ...closed, tax: true };
    expect(summaryRows({ ...empty, taxRateId: "r1" }, open, rates).at(-1)).toEqual({ label: "Tax", value: "Reduced" });
    expect(summaryRows({ ...empty, taxExempt: true, taxRateId: "r1" }, open, rates).at(-1)).toEqual({ label: "Tax", value: "Tax exempt" });
  });
});

describe("Easy-mode New customer, first paint", () => {
  it("is two big labelled boxes, the text-update state, five tiles and one Save button", () => {
    const html = easy();
    const words = text(html);

    expect(html).toMatch(/<label[^>]*for="name"[^>]*>Name<\/label>/);
    expect(html).toMatch(/<label[^>]*for="mobile"[^>]*>Mobile number<\/label>/);
    // Same field names the action has always read.
    expect(html).toMatch(/<input[^>]*id="name"[^>]*name="name"/);
    expect(html).toMatch(/<input[^>]*id="mobile"[^>]*name="mobile"/);
    // 56px phone / 64px tablet boxes, never the 36px toolbar input.
    expect(input(html, "name")).toMatch(/class="[^"]*\bh-14\b/);
    expect(input(html, "mobile")).toMatch(/class="[^"]*\bh-14\b/);
    expect(words).toContain("A name or a mobile number is enough.");

    expect(words).toContain("Text updates: Off");
    expect(words).toContain("Turns on when you add a mobile number.");

    for (const title of ["Add email", "Add address", "Business", "Notes", "Tax"]) {
      expect(tile(html, title)).toContain('aria-pressed="false"');
    }
    expect(words).toContain("Save customer");
    expect(words).not.toContain("Save changes");
  });

  it("starts with the cursor in the name box and Enter set to move on", () => {
    const html = easy();
    expect(input(html, "name")).toContain("autofocus");
    expect(input(html, "name")).toMatch(/enterkeyhint="next"/i);
    expect(input(html, "mobile")).toMatch(/enterkeyhint="done"/i);
  });

  it("shows the live picture as a question mark until something is typed, with a plain reason", () => {
    const html = easy();
    expect(html).toContain(">?</span>");
    expect(text(html)).toContain("No name yet");
    expect(text(html)).toContain("Add a name or a mobile number to save.");
  });

  it("posts nothing for the optional sections, exactly as the full form does", () => {
    const html = easy();
    for (const name of ["email", "businessName", "phone", "notes", "referredBy", "taxRateId", "address1", "taxExempt", "id"]) {
      expect(posted(html)).not.toContain(name);
      expect(html).not.toContain(`name="${name}"`);
    }
    // The e-mail consent default rides along while the e-mail section is closed.
    expect(posted(html)).toContain("emailOptIn");
  });

  it("keeps the phone bar and the side panel as two views of the same Save", () => {
    const html = easy();
    expect(html).toContain('aria-label="This customer"');
    expect((html.match(/Save customer/g) ?? []).length).toBe(2);
    // The phone bar is pinned above the tab bar; the panel only exists from the large layout up.
    expect(html).toContain("fixed inset-x-0");
    expect(html).toContain("lg:hidden");
    expect(html).toContain("hidden lg:sticky lg:top-2 lg:block");
  });

  it("has no hard-coded colours", () => {
    expect(easy()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\bbg-(?:red|green|blue|black|gray|slate)-\d|border-l-\d|border-r-\d/);
  });

  it("offers the tax rates only inside the Tax tile, and is not the full form", () => {
    const rates = [{ id: "r1", name: "Reduced", rateBps: 500, isDefault: false, active: true }];
    const html = easy({ taxRates: rates });
    expect(html).not.toContain("Reduced");
    expect(text(html)).not.toContain("Text repair updates");
    expect(text(html)).not.toContain("Phone number");
  });
});

describe("Easy-mode Edit customer, first paint", () => {
  it("fills the boxes, the picture and the text-update state from the customer", () => {
    const html = easy({ customer });
    expect(html).toMatch(/<input[^>]*id="name"[^>]*value="Anna Lopez"/);
    expect(html).toMatch(/<input[^>]*id="mobile"[^>]*value="780-555-0142"/);
    expect(html).toContain(">AL</span>");
    expect(text(html)).toContain("Text updates: Off");
    expect(text(html)).toContain("Save changes");
    // Editing does not steal the cursor.
    expect(input(html, "name")).not.toContain("autofocus");
    expect(html).toContain('name="id"');
  });

  it("opens only the sections that already hold something, and says so in words", () => {
    const html = easy({ customer });
    expect(tile(html, "Add address")).toContain('aria-pressed="true"');
    expect(tile(html, "Add address")).toContain("Added");
    expect(tile(html, "Add email")).toContain('aria-pressed="false"');
    expect(html).toContain('name="address1"');
    expect(html).toContain('value="12 Elm St"');
    expect(text(html)).toContain("12 Elm St, Edmonton");
  });

  it("posts a closed section's stored values, so saving cannot wipe them", () => {
    const html = easy({ customer: { ...customer, notes: null, email: "anna@example.com", businessName: "Acme" } });
    // Email and business hold something, so they show and post through their own inputs.
    expect(html).toContain('name="email"');
    expect(html).toContain('name="businessName"');
    // Notes and tax are closed but still post what is stored.
    expect(posted(html)).toEqual(expect.arrayContaining(["notes", "referredBy", "taxRateId"]));
    expect(posted(html)).not.toContain("address1");
  });

  it("keeps a switched-off tax exemption on the wire", () => {
    const html = easy({ customer: { ...customer, taxExempt: true } });
    expect(posted(html)).toContain("taxExempt");
  });

  it("shows a phone-only customer's name box empty and the picture from the number", () => {
    const html = easy({ customer: { ...customer, firstName: "Customer", lastName: "780-555-0142" } });
    expect(html).toMatch(/<input[^>]*id="name"[^>]*value=""/);
    expect(text(html)).toContain("Customer 780-555-0142");
    expect(html).toContain(">C7</span>");
  });

  it("asks for a number when Text updates is on but there is none to text", () => {
    const html = easy({ customer: { ...customer, mobile: null, smsOptIn: true } });
    expect(text(html)).toContain("Text updates: On");
    expect(text(html)).toContain("Add a mobile number so we can text them.");
  });

  it("shows Text updates: On for a customer who has it on", () => {
    const html = easy({ customer: { ...customer, smsOptIn: true } });
    expect(text(html)).toContain("Text updates: On");
    expect(text(html)).toContain("We text this number when the device is ready.");
    expect(posted(html)).toContain("smsOptIn");
  });
});

describe("the full form is unchanged without simple", () => {
  it("renders today's form, not the quick add", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerForm, { customer: null, taxRates: [] }));
    expect(text(html)).toContain("Phone number");
    expect(text(html)).toContain("Text repair updates");
    expect(text(html)).not.toContain("This customer");
    expect(text(html)).not.toContain("Add more");
  });
});
