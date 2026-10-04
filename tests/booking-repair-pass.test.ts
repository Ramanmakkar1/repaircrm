import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The flow only needs the action to exist; nothing here submits it.
vi.mock("@/app/(app)/appointments/actions", () => ({ saveAppointmentAction: vi.fn() }));

const { BookingFlow } = await import("@/components/appointments/booking/booking-dialog");
const { noMatchLine, searchPlaceholder, searchesByContact, stepFocus, whoHint, STEPS } = await import(
  "@/components/appointments/booking/flow"
);

import type { AppointmentFormValues, AppointmentPickers, CustomerOption } from "@/components/appointments/appointment-state";

const now = new Date(2026, 9, 3, 14, 20);

/** What app/(app)/appointments/page.tsx sends today: names, nothing to search a number by. */
const namesOnly: CustomerOption[] = [
  { value: "cus_1", label: "Daniel Brooks" },
  { value: "cus_2", label: "Elena Marquez" },
];
/** What the page sends once it selects the number and the address too. */
const withContacts: CustomerOption[] = [
  { value: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145", email: null },
  { value: "cus_2", label: "Elena Marquez", phone: null, email: "elena@example.com" },
];

const blank: AppointmentFormValues = {
  id: null,
  title: "",
  customerId: "",
  ticketId: "none",
  assignedToId: "none",
  locationId: "none",
  startDate: "2026-10-03",
  startTime: "15:00",
  duration: "60",
  endTime: "16:00",
  notes: "",
  reminderSentLabel: null,
};

const pickersOf = (customers: CustomerOption[]): AppointmentPickers => ({
  customers,
  ticketsByCustomer: {},
  techs: [],
  locations: [],
});
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const draw = (customers: CustomerOption[], values: AppointmentFormValues = blank) =>
  renderToStaticMarkup(
    createElement(BookingFlow, { values, pickers: pickersOf(customers), onSaved: () => {}, onCancel: () => {}, now } as never),
  );

describe("where the cursor goes when the dialog opens", () => {
  it("a keyboard with the search box on screen: the search box keeps the cursor it took", () => {
    expect(stepFocus({ step: 0, finePointer: true, fieldHasCursor: true })).toBe("field");
  });

  it("Edit visit opens on When, so the heading takes it, with or without a keyboard", () => {
    expect(stepFocus({ step: 1, finePointer: true, fieldHasCursor: false })).toBe("heading");
    expect(stepFocus({ step: 1, finePointer: false, fieldHasCursor: false })).toBe("heading");
  });

  it("a touch screen does not pop a keyboard up over the people to tap: the heading takes it", () => {
    expect(stepFocus({ step: 0, finePointer: false, fieldHasCursor: false })).toBe("heading");
  });

  it("Who with somebody already chosen has no search box, so the heading takes it", () => {
    expect(stepFocus({ step: 0, finePointer: true, fieldHasCursor: false })).toBe("heading");
  });

  it("the first run of the effect focuses before it returns (it used to return first, leaving focus on the page behind)", () => {
    const source = readFileSync("components/appointments/booking/booking-dialog.tsx", "utf8");
    const focusing = source.indexOf("stepFocus({");
    const returning = source.indexOf("if (opening) return;");
    expect(focusing).toBeGreaterThan(-1);
    expect(returning).toBeGreaterThan(-1);
    expect(focusing).toBeLessThan(returning);
    expect(source).toContain("headingRef.current?.focus");
  });

  it("the heading can take focus without being a tab stop, and without a keyboard", () => {
    const html = draw(withContacts, { ...blank, id: "appt_1", title: "Quote", customerId: "cus_1" });
    expect(html).toMatch(/<h2 id="bk-heading" tabindex="-1"/);
  });
});

describe("searching by phone when the page sends names only", () => {
  it("knows whether a number or an address can find anybody", () => {
    expect(searchesByContact(namesOnly)).toBe(false);
    expect(searchesByContact([])).toBe(false);
    expect(searchesByContact(withContacts)).toBe(true);
    expect(searchesByContact([{ value: "c", label: "C", phone: "", email: null }])).toBe(false);
  });

  it("does not say somebody is not on file when it never looked at their number", () => {
    const line = noMatchLine(namesOnly, "780-555-0142");
    expect(line).toBe("No name matches. Numbers are checked when you book. Tap New customer.");
    expect(line).not.toMatch(/on file/i);
    expect(noMatchLine(namesOnly, "dana@example.com")).toBe(
      "No name matches. Emails are checked when you book. Tap New customer.",
    );
  });

  it("still says nobody matches a name, because a name was searched", () => {
    expect(noMatchLine(namesOnly, "Zed")).toBe("Nobody on file matches “Zed”.");
  });

  it("says nobody on file once numbers really were searched", () => {
    expect(noMatchLine(withContacts, "780-555-0142")).toBe("Nobody on file matches “780-555-0142”.");
  });

  it("promises a phone search only when there is one", () => {
    expect(whoHint(namesOnly)).toBe("Search by name, or add someone new. Skip it for a walk-in.");
    expect(whoHint(namesOnly)).not.toMatch(/phone/i);
    expect(whoHint(withContacts)).toBe(STEPS[0].hint);
    expect(searchPlaceholder(namesOnly)).toBe("Customer name");
    expect(searchPlaceholder(withContacts)).toBe("Name or phone number");
  });

  it("draws the honest hint and placeholder for a names-only list, and the full ones otherwise", () => {
    const names = draw(namesOnly);
    expect(text(names)).toContain("Search by name, or add someone new.");
    expect(text(names)).not.toContain("phone number, or add someone new");
    expect(names).toContain('placeholder="Customer name"');
    expect(names).toContain('aria-label="Search customers by name"');
    // The New customer box can still take a number: that stays on offer.
    expect(text(names)).toContain("Just a name or a phone number");

    const both = draw(withContacts);
    expect(text(both)).toContain("Search by name or phone number, or add someone new.");
    expect(both).toContain('placeholder="Name or phone number"');
    expect(both).toContain('aria-label="Search customers by name or phone"');
  });

  it("only the first step's hint changes: the other steps read as before", () => {
    const edit = draw(namesOnly, { ...blank, id: "appt_1", title: "Quote", customerId: "cus_1" });
    expect(text(edit)).toContain("When?");
    expect(text(edit)).not.toContain("Search by name");
  });
});
