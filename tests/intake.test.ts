import { describe, expect, it } from "vitest";

import { keptFields } from "@/lib/customers/form-sections";
import { newCustomerContactMessage } from "@/lib/customers/search-options";
import { renamedPlaceholder, repairSubject, splitCustomerName } from "@/lib/intake";

describe("splitCustomerName", () => {
  it("splits on the first space and keeps the rest as the last name", () => {
    expect(splitCustomerName("Sarah Patel")).toEqual({ firstName: "Sarah", lastName: "Patel" });
    expect(splitCustomerName("Anna Maria Lopez")).toEqual({ firstName: "Anna", lastName: "Maria Lopez" });
  });

  it("collapses extra spaces and ignores a phone number when there is a name", () => {
    expect(splitCustomerName("  Sam    Lee ", "780-555-0142")).toEqual({ firstName: "Sam", lastName: "Lee" });
  });

  it("gives a one-word name an empty last name", () => {
    expect(splitCustomerName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });

  it('names a phone-only customer "Customer <number>"', () => {
    expect(splitCustomerName("", "  780-555-0142 ")).toEqual({ firstName: "Customer", lastName: "780-555-0142" });
    expect(splitCustomerName("   ", "780-555-0142")).toEqual({ firstName: "Customer", lastName: "780-555-0142" });
  });
});

describe("repairSubject", () => {
  it("joins the device and the problem", () => {
    expect(repairSubject("Apple iPhone 14", "Screen Repair")).toBe("Apple iPhone 14 — Screen Repair");
  });

  it("is blank until a problem is chosen, so the field stays a suggestion", () => {
    expect(repairSubject("Apple iPhone 14", "")).toBe("");
    expect(repairSubject("Apple iPhone 14", "   ")).toBe("");
  });

  it("uses the problem alone when the device is unknown", () => {
    expect(repairSubject("  ", "No Power")).toBe("No Power");
  });

  it("stays within the 200 characters a repair subject may hold", () => {
    expect(repairSubject("Phone", "x".repeat(300))).toHaveLength(200);
  });
});

describe("renamedPlaceholder", () => {
  const placeholder = { firstName: "Customer", lastName: "780-555-0142" };
  const mobileOnly = { mobile: "780-555-0142", phone: null };

  it("moves the placeholder to the new number", () => {
    expect(renamedPlaceholder(placeholder, mobileOnly, { mobile: "780-555-0199", phone: null })).toEqual({
      firstName: "Customer",
      lastName: "780-555-0199",
    });
  });

  it("follows a number held in the office phone column too", () => {
    expect(
      renamedPlaceholder(placeholder, { mobile: null, phone: "780-555-0142" }, { mobile: null, phone: "780-555-0188" }),
    ).toEqual({ firstName: "Customer", lastName: "780-555-0188" });
  });

  it("never overwrites a name somebody typed", () => {
    expect(
      renamedPlaceholder({ firstName: "Sarah", lastName: "Patel" }, mobileOnly, { mobile: "780-555-0199", phone: null }),
    ).toBeNull();
    // Even one that merely starts like the placeholder.
    expect(
      renamedPlaceholder({ firstName: "Customer", lastName: "Service" }, mobileOnly, { mobile: "780-555-0199", phone: null }),
    ).toBeNull();
  });

  it("leaves a placeholder for some other number alone", () => {
    expect(
      renamedPlaceholder({ firstName: "Customer", lastName: "780-555-0100" }, mobileOnly, { mobile: "780-555-0199", phone: null }),
    ).toBeNull();
  });

  it("does nothing when the number the name is based on did not change", () => {
    // The mobile still wins, so an office-phone edit does not touch the name.
    expect(
      renamedPlaceholder(placeholder, { mobile: "780-555-0142", phone: "1" }, { mobile: "780-555-0142", phone: "2" }),
    ).toBeNull();
    expect(renamedPlaceholder(placeholder, mobileOnly, mobileOnly)).toBeNull();
  });

  it("does nothing for a customer who had no number to be named after", () => {
    expect(
      renamedPlaceholder({ firstName: "Customer", lastName: "" }, { mobile: null, phone: null }, { mobile: "780-555-0199", phone: null }),
    ).toBeNull();
  });

  it('falls back to a bare "Customer" when the last number is removed', () => {
    expect(renamedPlaceholder(placeholder, mobileOnly, { mobile: null, phone: null })).toEqual({
      firstName: "Customer",
      lastName: "",
    });
  });
});

describe("newCustomerContactMessage — the inline New customer box", () => {
  it("accepts a name alone, a phone alone, or both", () => {
    expect(newCustomerContactMessage("Sam Lee", "")).toBe("");
    expect(newCustomerContactMessage("", "780-555-0142")).toBe("");
    expect(newCustomerContactMessage("Sam", "780-555-0142")).toBe("");
  });

  it("asks for one of them, in plain words, when both are blank", () => {
    expect(newCustomerContactMessage("", "")).toBe("Add a name or a phone number");
    expect(newCustomerContactMessage("  ", " ")).toBe("Add a name or a phone number");
  });
});

describe("keptFields — switched-off sections on an existing customer", () => {
  const sections = {
    notes: ["notes", "referredBy"],
    tax: ["taxRateId"],
    address: ["address1", "city"],
  } as const;
  const values = {
    notes: "Prefers texts",
    referredBy: "",
    taxRateId: "rate_1",
    address1: "12 Elm St",
    city: "Edmonton",
  };

  it("posts the stored values of every section that is switched off", () => {
    expect(keptFields(sections, { notes: false, tax: false, address: true }, values)).toEqual([
      { name: "notes", value: "Prefers texts" },
      { name: "referredBy", value: "" },
      { name: "taxRateId", value: "rate_1" },
    ]);
  });

  it("leaves a section that is showing to its own inputs", () => {
    expect(keptFields(sections, { notes: true, tax: true, address: true }, values)).toEqual([]);
  });

  it("posts an emptied field as empty, so clearing it while it showed still works", () => {
    expect(keptFields({ notes: ["notes"], tax: ["taxRateId"] }, { notes: false, tax: false }, { notes: "", taxRateId: null })).toEqual([
      { name: "notes", value: "" },
      { name: "taxRateId", value: "" },
    ]);
  });
});
