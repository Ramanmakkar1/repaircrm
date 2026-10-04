import { describe, expect, it } from "vitest";

import {
  customerFacts,
  isPlaceholderName,
  primaryPhone,
  telHref,
} from "@/components/customers/customer-facts";

const NOW = new Date(2026, 9, 3, 12, 0, 0); // Oct 3, 2026

describe("customerFacts", () => {
  it("says nothing for a brand-new customer", () => {
    expect(customerFacts({ openRepairs: 0, owedCents: 0, lastVisit: null, now: NOW })).toEqual([]);
  });

  it("states each fact in words, only when it is true", () => {
    const facts = customerFacts({
      openRepairs: 2,
      owedCents: 12000,
      lastVisit: new Date(2026, 8, 30),
      now: NOW,
    });
    expect(facts.map((fact) => fact.label)).toEqual(["2 open repairs", "$120.00 owed", "Last visit Sep 30"]);
    // Money owed is the only one that is emphasised, and it still says "owed".
    expect(facts.map((fact) => fact.tone)).toEqual(["neutral", "alert", "neutral"]);
  });

  it("uses the singular for one open repair", () => {
    const [fact] = customerFacts({ openRepairs: 1, owedCents: 0, lastVisit: null, now: NOW });
    expect(fact.label).toBe("1 open repair");
  });

  it("leaves the owed fact off when nothing is owed", () => {
    const labels = customerFacts({ openRepairs: 0, owedCents: 0, lastVisit: new Date(2026, 8, 30), now: NOW }).map((fact) => fact.label);
    expect(labels).toEqual(["Last visit Sep 30"]);
  });

  it("adds the year once the last visit was not this year", () => {
    const [fact] = customerFacts({ openRepairs: 0, owedCents: 0, lastVisit: new Date(2025, 8, 30), now: NOW });
    expect(fact.label).toBe("Last visit Sep 30, 2025");
  });

  it("ignores an invalid date instead of printing it", () => {
    expect(customerFacts({ openRepairs: 0, owedCents: 0, lastVisit: new Date("nope"), now: NOW })).toEqual([]);
  });
});

describe("primaryPhone", () => {
  it("prefers the mobile, which is where the counter form saves the main number", () => {
    expect(primaryPhone({ phone: "111", mobile: "222" })).toEqual({ field: "mobile", label: "Mobile", value: "222" });
  });

  it("falls back to the office phone when there is no mobile", () => {
    expect(primaryPhone({ phone: "111", mobile: null })).toEqual({ field: "phone", label: "Phone", value: "111" });
  });

  it("edits the mobile column when neither number is set, so a new number has somewhere to go", () => {
    expect(primaryPhone({ phone: null, mobile: null })).toEqual({ field: "mobile", label: "Mobile", value: "" });
  });
});

describe("telHref", () => {
  it("keeps only the dialable characters", () => {
    expect(telHref("(512) 555-0178")).toBe("tel:5125550178");
    expect(telHref("512.555.0178")).toBe("tel:5125550178");
  });

  it("keeps a leading plus for international numbers", () => {
    expect(telHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });
});

describe("isPlaceholderName", () => {
  it("spots a quick-added customer, whose initials would read as 'C5'", () => {
    expect(isPlaceholderName("Customer 5125550199")).toBe(true);
    expect(isPlaceholderName("customer (512) 555-0199")).toBe(true);
  });

  it("leaves real names alone, even ones that start with Customer", () => {
    expect(isPlaceholderName("Elena Marquez")).toBe(false);
    expect(isPlaceholderName("Customer Care Ltd")).toBe(false);
  });
});
