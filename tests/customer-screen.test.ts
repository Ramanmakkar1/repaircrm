import { describe, expect, it } from "vitest";

import { smsHref } from "@/components/customers/customer-facts";
import {
  asCustomerTab,
  CUSTOMER_SECTIONS_ID,
  customerSummary,
  customerTabHref,
  customerTabs,
  invoiceRowFigures,
  messageOptions,
  repairRowLines,
  resolveCustomerTab,
  shortDate,
  type InvoiceRowInput,
} from "@/components/customers/customer-screen";

const NOW = new Date(2026, 9, 3, 12, 0, 0);
const NOW_MS = Date.UTC(2026, 9, 3, 12, 0, 0);

describe("sections (the big tabs)", () => {
  it("reads ?tab= and ignores anything that is not a section", () => {
    expect(asCustomerTab("invoices")).toBe("invoices");
    expect(asCustomerTab(["devices", "details"])).toBe("devices");
    expect(asCustomerTab("tickets")).toBeNull();
    expect(asCustomerTab(undefined)).toBeNull();
    expect(asCustomerTab("")).toBeNull();
  });

  it("opens on Repairs, and on Details when Stripe sends the person back from the card page", () => {
    expect(resolveCustomerTab(undefined)).toBe("repairs");
    expect(resolveCustomerTab("nonsense")).toBe("repairs");
    expect(resolveCustomerTab("devices")).toBe("devices");
    expect(resolveCustomerTab(undefined, "card-saved")).toBe("details");
    expect(resolveCustomerTab(undefined, "card-canceled")).toBe("details");
    expect(resolveCustomerTab(undefined, "created")).toBe("repairs");
    // An explicit tab wins over the flash.
    expect(resolveCustomerTab("invoices", "card-saved")).toBe("invoices");
  });

  it("keeps the plain URL for Repairs and puts every other section in ?tab=", () => {
    expect(customerTabHref("cus_1", "repairs")).toBe("/customers/cus_1");
    expect(customerTabHref("cus_1", "invoices")).toBe("/customers/cus_1?tab=invoices");
    expect(customerTabHref("cus_1", "details")).toBe("/customers/cus_1?tab=details");
  });

  it("builds four tabs with counts on the lists and none on Details", () => {
    const tabs = customerTabs({ customerId: "cus_1", active: "invoices", counts: { repairs: 3, invoices: 0, devices: 2 } });
    expect(tabs.map((tab) => tab.label)).toEqual(["Repairs", "Invoices", "Devices", "Details"]);
    expect(tabs.map((tab) => tab.count)).toEqual([3, 0, 2, undefined]);
    expect(tabs.map((tab) => Boolean(tab.active))).toEqual([false, true, false, false]);
    // Every tab also points at the tab row itself, so a tap scrolls the new list into view.
    expect(tabs[1].href).toBe("/customers/cus_1?tab=invoices#sections");
  });

  it("points every tab at the tab row, so a phone scrolls to the list instead of staying under the header", () => {
    expect(CUSTOMER_SECTIONS_ID).toBe("sections");
    const tabs = customerTabs({ customerId: "cus_1", active: "repairs", counts: { repairs: 1, invoices: 1, devices: 1 } });
    expect(tabs.map((tab) => tab.href)).toEqual([
      "/customers/cus_1#sections",
      "/customers/cus_1?tab=invoices#sections",
      "/customers/cus_1?tab=devices#sections",
      "/customers/cus_1?tab=details#sections",
    ]);
    // The plain helper (used by "Add a phone number" and "Past messages") is untouched.
    expect(customerTabHref("cus_1", "devices")).toBe("/customers/cus_1?tab=devices");
  });
});

describe("the summary strip, in words", () => {
  const base = { openRepairs: 2, totalRepairs: 3, owedCents: 2705, creditCents: 3788, lastVisit: new Date(2026, 8, 29), customerSince: new Date(2026, 5, 4), now: NOW };
  const byKey = (items: ReturnType<typeof customerSummary>) => Object.fromEntries(items.map((item) => [item.key, item]));

  it("says what is open, owed, on credit and when they last came in", () => {
    const items = byKey(customerSummary(base));
    expect(items.repairs).toMatchObject({ value: "2 open", detail: "3 repairs in all", tone: "neutral" });
    expect(items.owed).toMatchObject({ value: "$27.05 owed", tone: "alert" });
    expect(items.credit).toMatchObject({ value: "$37.88 credit", tone: "good" });
    expect(items.visit).toMatchObject({ value: "Sep 29", detail: "Customer since Jun 4, 2026", tone: "neutral" });
  });

  it("keeps four labelled pairs in a fixed order", () => {
    expect(customerSummary(base).map((item) => item.label)).toEqual(["Open repairs", "Unpaid", "Store credit", "Last visit"]);
  });

  it("reads quietly for a new customer: no zeros, only plain words", () => {
    const items = byKey(customerSummary({ ...base, openRepairs: 0, totalRepairs: 0, owedCents: 0, creditCents: 0, lastVisit: null }));
    expect(items.repairs).toMatchObject({ value: "None yet", tone: "muted" });
    expect(items.repairs.detail).toBeUndefined();
    expect(items.owed).toMatchObject({ value: "Nothing owed", tone: "muted" });
    expect(items.credit).toMatchObject({ value: "No credit", tone: "muted" });
    expect(items.visit).toMatchObject({ value: "No visits yet", tone: "muted" });
  });

  it("separates 'nothing open' from 'never had a repair'", () => {
    const items = byKey(customerSummary({ ...base, openRepairs: 0, totalRepairs: 4 }));
    expect(items.repairs).toMatchObject({ value: "None open", detail: "4 repairs in all", tone: "muted" });
    expect(byKey(customerSummary({ ...base, openRepairs: 1, totalRepairs: 1 })).repairs.detail).toBe("1 repair in all");
  });

  it("adds the year to a visit from another year so it never reads as recent", () => {
    expect(shortDate(new Date(2025, 8, 29), NOW)).toBe("Sep 29, 2025");
    expect(shortDate(new Date(2026, 8, 29), NOW)).toBe("Sep 29");
    expect(byKey(customerSummary({ ...base, lastVisit: new Date(2025, 11, 1) })).visit.value).toBe("Dec 1, 2025");
  });

  it("ignores an invalid date instead of printing 'Invalid Date'", () => {
    const items = byKey(customerSummary({ ...base, lastVisit: new Date("nope"), customerSince: new Date("nope") }));
    expect(items.visit.value).toBe("No visits yet");
    expect(items.visit.detail).toBeUndefined();
  });
});

describe("the Message tile", () => {
  const keys = (options: ReturnType<typeof messageOptions>) => options.map((option) => option.key);

  it("offers a text, an email and the message log when it has both", () => {
    const options = messageOptions({ customerId: "cus_1", phone: "(512) 555-0111", email: "elena@example.com" });
    expect(keys(options)).toEqual(["text", "email", "history"]);
    expect(options[0].href).toBe("sms:5125550111");
    expect(options[1].href).toBe("mailto:elena@example.com");
    expect(options[2].href).toBe("/customers/cus_1?tab=details#messages");
  });

  it("offers only what the customer has", () => {
    expect(keys(messageOptions({ customerId: "c", phone: "5125550199", email: null }))).toEqual(["text", "history"]);
    expect(keys(messageOptions({ customerId: "c", phone: "  ", email: "a@b.co" }))).toEqual(["email", "history"]);
  });

  it("starts with adding a number when there is neither", () => {
    const options = messageOptions({ customerId: "cus_1", phone: null, email: undefined });
    expect(keys(options)).toEqual(["add", "history"]);
    expect(options[0].href).toBe("/customers/cus_1?tab=details");
  });

  it("builds an sms link the way telHref builds a tel link", () => {
    expect(smsHref("(512) 555-0178")).toBe("sms:5125550178");
    expect(smsHref("+44 20 7946 0958")).toBe("sms:+442079460958");
  });
});

describe("a repair row", () => {
  it("names the job and keeps the device as the quiet line", () => {
    expect(repairRowLines({ number: 1008, subject: "Cracked screen", asset: { type: "Phone", make: "Apple", model: "iPhone 14 Pro" } })).toEqual({
      title: "#1008 · Cracked screen",
      subtitle: "Apple iPhone 14 Pro",
    });
  });

  it("leaves the device out when the subject already names it", () => {
    expect(repairRowLines({ number: 1013, subject: "iPhone 14 Pro — touch dropping out", asset: { type: "Phone", make: "Apple", model: "iPhone 14 Pro" } })).toEqual({
      title: "#1013 · iPhone 14 Pro — touch dropping out",
      subtitle: null,
    });
  });

  it("has no second line without a device, and falls back to the device without a subject", () => {
    expect(repairRowLines({ number: 1010, subject: "Walk-in screen protector", asset: null })).toEqual({ title: "#1010 · Walk-in screen protector", subtitle: null });
    expect(repairRowLines({ number: 7, subject: "  ", asset: { type: "Laptop", make: null, model: null } })).toEqual({ title: "#7 · Laptop", subtitle: null });
    expect(repairRowLines({ number: 8, subject: "", asset: null }).title).toBe("#8 · Repair");
  });
});

describe("an invoice row", () => {
  const line = { quantity: 1, unitPriceCents: 45_000, taxable: false };
  const invoice: InvoiceRowInput = {
    status: "SENT",
    taxRateBps: 0,
    createdAt: new Date(Date.UTC(2026, 8, 18, 12)),
    dueDate: new Date(Date.UTC(2026, 9, 1)),
    paidAt: null,
    lines: [line],
    payments: [],
  };

  it("says the balance in words and how late it is", () => {
    const figures = invoiceRowFigures(invoice, NOW_MS);
    expect(figures.totalCents).toBe(45_000);
    expect(figures.balanceCents).toBe(45_000);
    expect(figures.money).toEqual({ text: "$450.00 due", tone: "overdue" });
    expect(figures.overdue).toBe("2 days overdue");
    expect(figures.line).toMatchObject({ lead: "Raised Sep 18", tail: "due Oct 1", late: true });
  });

  it("subtracts payments: a part-paid invoice shows what is left", () => {
    const figures = invoiceRowFigures({ ...invoice, status: "PARTIAL", payments: [{ amountCents: 15_000 }] }, NOW_MS);
    expect(figures.balanceCents).toBe(30_000);
    expect(figures.money.text).toBe("$300.00 due");
  });

  it("is quiet once paid", () => {
    const figures = invoiceRowFigures({ ...invoice, status: "PAID", paidAt: new Date(Date.UTC(2026, 8, 25, 12)), payments: [{ amountCents: 45_000 }] }, NOW_MS);
    expect(figures.money).toEqual({ text: "Paid", tone: "paid" });
    expect(figures.overdue).toBeNull();
    expect(figures.line).toMatchObject({ lead: "Paid Sep 25", tail: null, late: false });
  });

  it("never calls a void or a draft invoice overdue", () => {
    expect(invoiceRowFigures({ ...invoice, status: "VOID" }, NOW_MS)).toMatchObject({ overdue: null, money: { text: "Voided" } });
    expect(invoiceRowFigures({ ...invoice, status: "DRAFT", dueDate: null }, NOW_MS).money.text).toBe("Not sent yet");
  });
});
