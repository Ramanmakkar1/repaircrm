import { describe, expect, it } from "vitest";

import type { AppointmentFormValues, CustomerOption } from "@/components/appointments/appointment-state";
import {
  LAST_STEP,
  MSG,
  NEW,
  QUICK_DURATIONS,
  STEPS,
  VISIT_KINDS,
  addMinutesToTime,
  blocker,
  compactRange,
  customerName,
  endOf,
  findCustomers,
  hasCustomer,
  initialStep,
  isLongerDuration,
  kindOfTitle,
  normalizeDuration,
  primaryAction,
  quickDays,
  stepDone,
  stepForServerError,
  summaryParts,
  timeSlots,
  validate,
  whenLabel,
  withCustomer,
  withDuration,
  withKind,
  withNewCustomer,
} from "@/components/appointments/booking/flow";
import { keyboardBox } from "@/components/appointments/booking/viewport";

// A Saturday afternoon, in the shop's own (local) time zone.
const now = new Date(2026, 9, 3, 14, 20);

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
};

const customers: CustomerOption[] = [
  { value: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145" },
  { value: "cus_2", label: "Elena Marquez", phone: "512-555-0101", email: "elena@example.com" },
  { value: "cus_3", label: "Okonkwo Dental" },
];

describe("steps", () => {
  it("is Who, When, What for", () => {
    expect(STEPS.map((step) => step.label)).toEqual(["Who", "When", "What for"]);
    expect(LAST_STEP).toBe(2);
  });

  it("opens a new booking on Who and an existing one on When", () => {
    expect(initialStep({ id: null })).toBe(0);
    expect(initialStep({ id: "appt_1" })).toBe(1);
  });
});

describe("what the visit is for", () => {
  it("offers Drop-off, Pick-up, Quote, Repair check-in and Other, each with a picture", () => {
    expect(VISIT_KINDS.map((tile) => tile.label)).toEqual(["Drop-off", "Pick-up", "Quote", "Repair check-in", "Other"]);
    for (const tile of VISIT_KINDS) expect(tile.photo).toMatch(/^\/images\/(home|products)\/[a-z-]+\.webp$/);
  });

  it("knows which box a saved title is", () => {
    expect(kindOfTitle("")).toBe("");
    expect(kindOfTitle("  drop-off ")).toBe("dropoff");
    expect(kindOfTitle("Repair check-in")).toBe("checkin");
    expect(kindOfTitle("Screen swap drop-off")).toBe("other");
  });

  it("tapping a box writes the title, and tapping another rewrites it", () => {
    const first = withKind(blank, "", "dropoff");
    expect(first.title).toBe("Drop-off");
    expect(withKind(first, "dropoff", "quote").title).toBe("Quote");
  });

  it("never overwrites a title somebody typed", () => {
    const typed = { ...blank, title: "Drop-off: iPad, cracked glass" };
    expect(withKind(typed, "dropoff", "pickup")).toBe(typed);
    expect(withKind({ ...blank, title: "Screen swap" }, "", "quote").title).toBe("Screen swap");
  });

  it("Other empties an automatic title so the words can be typed", () => {
    expect(withKind({ ...blank, title: "Quote" }, "quote", "other").title).toBe("");
  });
});

describe("who", () => {
  it("finds people by name, by part of a name, by email and by phone number", () => {
    expect(findCustomers(customers, "brooks").map((c) => c.value)).toEqual(["cus_1"]);
    expect(findCustomers(customers, "mar eles").map((c) => c.value)).toEqual([]);
    expect(findCustomers(customers, "elena marq").map((c) => c.value)).toEqual(["cus_2"]);
    expect(findCustomers(customers, "elena@example").map((c) => c.value)).toEqual(["cus_2"]);
    expect(findCustomers(customers, "512 555 0145").map((c) => c.value)).toEqual(["cus_1"]);
    expect(findCustomers(customers, "5550101").map((c) => c.value)).toEqual(["cus_2"]);
    expect(findCustomers(customers, "  ")).toEqual([]);
  });

  it("a number nobody has is still a new customer, seeded with that number", () => {
    expect(findCustomers([{ value: "cus_3", label: "Okonkwo Dental" }], "780-555-0142")).toEqual([]);
    const values = withNewCustomer(blank, "780-555-0142");
    expect(values).toMatchObject({ customerId: NEW, newCustomerName: "", newCustomerPhone: "780-555-0142" });
    expect(withNewCustomer(blank, "Dana Cole")).toMatchObject({ newCustomerName: "Dana Cole", newCustomerPhone: "" });
    expect(withNewCustomer(blank, "dana@example.com")).toMatchObject({ newCustomerEmail: "dana@example.com" });
    expect(withNewCustomer(blank, "")).toMatchObject({ customerId: NEW, newCustomerName: "", newCustomerPhone: "" });
  });

  it("choosing somebody else forgets the repair that belonged to the last person", () => {
    const linked = { ...blank, customerId: "cus_1", ticketId: "tkt_1" };
    expect(withCustomer(linked, "cus_2")).toMatchObject({ customerId: "cus_2", ticketId: "none" });
    expect(withCustomer(linked, "cus_1")).toBe(linked);
    expect(withCustomer(linked, "")).toMatchObject({ customerId: "", ticketId: "none" });
  });

  it("says who in words", () => {
    expect(customerName(blank, { customers })).toBe("");
    expect(customerName({ ...blank, customerId: "cus_2" }, { customers })).toBe("Elena Marquez");
    expect(customerName({ ...blank, customerId: "cus_99" }, { customers })).toBe("Saved customer");
    expect(customerName({ ...blank, customerId: NEW, newCustomerName: " Dana ", newCustomerPhone: "1" }, { customers })).toBe("Dana");
    expect(customerName({ ...blank, customerId: NEW, newCustomerPhone: "780-555-0142" }, { customers })).toBe("780-555-0142");
    expect(hasCustomer(blank)).toBe(false);
    expect(hasCustomer({ ...blank, customerId: "none" })).toBe(false);
    expect(hasCustomer({ ...blank, customerId: "cus_1" })).toBe(true);
  });
});

describe("when", () => {
  it("offers Today, Tomorrow and Next week, each with the date it means", () => {
    expect(quickDays(now)).toEqual([
      { key: "today", label: "Today", date: "2026-10-03", detail: "Sat, Oct 3" },
      { key: "tomorrow", label: "Tomorrow", date: "2026-10-04", detail: "Sun, Oct 4" },
      { key: "week", label: "Next week", date: "2026-10-10", detail: "Sat, Oct 10" },
    ]);
  });

  it("goes over a month end", () => {
    expect(quickDays(new Date(2026, 9, 30)).map((day) => day.date)).toEqual(["2026-10-30", "2026-10-31", "2026-11-06"]);
  });

  it("has one time box per hour of the calendar's day", () => {
    const slots = timeSlots();
    expect(slots).toHaveLength(12);
    expect(slots[0]).toEqual({ value: "08:00", label: "8 AM" });
    expect(slots[4]).toEqual({ value: "12:00", label: "12 PM" });
    expect(slots[11]).toEqual({ value: "19:00", label: "7 PM" });
  });

  it("can be told a different slot size", () => {
    const half = timeSlots(30, 9, 11);
    expect(half.map((slot) => slot.value)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(half[1].label).toBe("9:30 AM");
  });

  it("has 15, 30 and 60 minute chips, and keeps every older length one tap behind Longer", () => {
    expect(QUICK_DURATIONS.map((chip) => chip.value)).toEqual(["15", "30", "60"]);
    expect(isLongerDuration("60")).toBe(false);
    expect(isLongerDuration("90")).toBe(true);
    expect(isLongerDuration("120")).toBe(true);
    expect(isLongerDuration("custom")).toBe(true);
  });

  it("works out the end from the length, or from the end time when custom", () => {
    expect(endOf(blank)).toEqual(new Date(2026, 9, 3, 16, 0));
    expect(endOf({ ...blank, duration: "15" })).toEqual(new Date(2026, 9, 3, 15, 15));
    expect(endOf({ ...blank, duration: "custom", endTime: "17:30" })).toEqual(new Date(2026, 9, 3, 17, 30));
    expect(endOf({ ...blank, duration: "custom", endTime: "14:00" })).toBeNull();
    expect(endOf({ ...blank, startTime: "" })).toBeNull();
  });

  it("adds minutes to a time without wrapping past midnight", () => {
    expect(addMinutesToTime("10:30", 60)).toBe("11:30");
    expect(addMinutesToTime("23:30", 60)).toBe("23:59");
    expect(addMinutesToTime("nope", 60)).toBe("nope");
  });

  it("picking 'End time' starts an hour in, never at or before the start", () => {
    expect(withDuration({ ...blank, endTime: "14:00" }, "custom")).toMatchObject({ duration: "custom", endTime: "16:00" });
    expect(withDuration({ ...blank, endTime: "17:15" }, "custom").endTime).toBe("17:15");
    expect(withDuration(blank, "30")).toMatchObject({ duration: "30", endTime: "16:00" });
  });

  it("opens a custom 15 minute booking as the 15 min chip", () => {
    expect(normalizeDuration({ ...blank, duration: "custom", startTime: "10:00", endTime: "10:15" }).duration).toBe("15");
    expect(normalizeDuration({ ...blank, duration: "custom", startTime: "10:00", endTime: "10:20" }).duration).toBe("custom");
    expect(normalizeDuration(blank)).toBe(blank);
  });
});

describe("saying when", () => {
  it("writes ranges as short as they can honestly be", () => {
    expect(compactRange(new Date(2026, 9, 3, 10), new Date(2026, 9, 3, 11))).toBe("10–11 AM");
    expect(compactRange(new Date(2026, 9, 3, 10, 30), new Date(2026, 9, 3, 11, 30))).toBe("10:30–11:30 AM");
    expect(compactRange(new Date(2026, 9, 3, 11), new Date(2026, 9, 3, 13))).toBe("11 AM – 1 PM");
    expect(compactRange(new Date(2026, 9, 3, 15), new Date(2026, 9, 3, 15, 15))).toBe("3–3:15 PM");
  });

  it("says Today and Tomorrow, then the weekday and date", () => {
    expect(whenLabel(blank, now)).toBe("Today, 3–4 PM");
    expect(whenLabel({ ...blank, startDate: "2026-10-04" }, now)).toBe("Tomorrow, 3–4 PM");
    expect(whenLabel({ ...blank, startDate: "2026-10-10", startTime: "09:00", duration: "30" }, now)).toBe("Sat, Oct 10, 9–9:30 AM");
    expect(whenLabel({ ...blank, duration: "custom", endTime: "14:00" }, now)).toBe("Today, 3 PM");
    expect(whenLabel({ ...blank, startDate: "" }, now)).toBe("");
  });

  it("sums the booking up as Who - When - What", () => {
    const parts = summaryParts(
      { ...blank, customerId: "cus_2", title: "Quote" },
      { customers },
      now,
    );
    expect(parts.map((part) => [part.label, part.value, part.detail])).toEqual([
      ["Who", "Elena Marquez", undefined],
      ["When", "Today", "3–4 PM"],
      ["What", "Quote", undefined],
    ]);
    expect(parts.map((part) => part.step)).toEqual([0, 1, 2]);
    const empty = summaryParts(blank, { customers }, now);
    expect(empty[0]).toMatchObject({ value: "", empty: "Walk-in" });
    expect(empty[1]).toMatchObject({ value: "Today", detail: "3–4 PM" });
    expect(summaryParts({ ...blank, startTime: "" }, { customers }, now)[1]).toMatchObject({ value: "", empty: "Not set" });
    expect(empty[2]).toMatchObject({ value: "", empty: "Not chosen" });
  });
});

describe("what is missing", () => {
  it("only needs a title: a customer is optional and the time starts filled in", () => {
    expect(validate(blank, "")).toEqual([{ step: 2, field: "title", message: MSG.title }]);
    expect(validate({ ...blank, title: "Quote" }, "quote")).toEqual([]);
  });

  it("asks for the title in words when Other is chosen", () => {
    expect(blocker(blank, "other")?.message).toBe(MSG.titleOther);
  });

  it("says a new customer needs a name or a phone number, as the server does", () => {
    const issues = validate({ ...blank, title: "Quote", customerId: NEW }, "quote");
    expect(issues).toEqual([{ step: 0, field: "newCustomerName", message: "Add a name or a phone number." }]);
    expect(validate({ ...blank, title: "Quote", customerId: NEW, newCustomerPhone: "780-555-0142" }, "quote")).toEqual([]);
    expect(validate({ ...blank, title: "Quote", customerId: NEW, newCustomerName: "Dana" }, "quote")).toEqual([]);
  });

  it("refuses an email that does not look right, and allows none", () => {
    const base = { ...blank, title: "Quote", customerId: NEW, newCustomerName: "Dana" };
    expect(validate({ ...base, newCustomerEmail: "dana@" }, "quote")[0]).toMatchObject({ step: 0, message: MSG.email });
    expect(validate({ ...base, newCustomerEmail: "dana@example.com" }, "quote")).toEqual([]);
    expect(validate({ ...base, newCustomerEmail: "" }, "quote")).toEqual([]);
  });

  it("needs a date and a time, and a sensible end when the end is custom", () => {
    const ok = { ...blank, title: "Quote" };
    expect(validate({ ...ok, startDate: "" }, "quote")).toEqual([{ step: 1, field: "startTime", message: MSG.when }]);
    expect(validate({ ...ok, startTime: "" }, "quote")[0].message).toBe(MSG.when);
    expect(validate({ ...ok, duration: "custom", endTime: "" }, "quote")[0].message).toBe(MSG.endTime);
    expect(validate({ ...ok, duration: "custom", endTime: "15:00" }, "quote")[0].message).toBe(MSG.endAfter);
    expect(validate({ ...ok, duration: "custom", endTime: "15:05" }, "quote")).toEqual([]);
  });

  it("lists problems in step order", () => {
    const issues = validate({ ...blank, customerId: NEW, startDate: "" }, "");
    expect(issues.map((issue) => issue.step)).toEqual([0, 1, 2]);
  });

  it("sends a refusal from the server to the step that can fix it", () => {
    expect(stepForServerError("Add a name or a phone number.")).toBe(0);
    expect(stepForServerError("That email doesn't look right — fix it or leave it blank.")).toBe(0);
    expect(stepForServerError("Pick a start date and time.")).toBe(1);
    expect(stepForServerError("Pick an end time.")).toBe(1);
    expect(stepForServerError("The end time has to be after the start time.")).toBe(1);
    expect(stepForServerError("Pick how long the appointment runs.")).toBe(1);
    expect(stepForServerError("Give the appointment a title.")).toBe(2);
    expect(stepForServerError("Appointment not found.")).toBeNull();
    expect(stepForServerError("That tech is already booked then.")).toBeNull();
  });

  it("ticks a step only once it holds a real choice", () => {
    expect(stepDone(blank, { customers }, 0)).toBe(false);
    expect(stepDone({ ...blank, customerId: "cus_1" }, { customers }, 0)).toBe(true);
    expect(stepDone({ ...blank, customerId: NEW }, { customers }, 0)).toBe(false);
    expect(stepDone(blank, { customers }, 1)).toBe(true);
    expect(stepDone({ ...blank, startDate: "" }, { customers }, 1)).toBe(false);
    expect(stepDone(blank, { customers }, 2)).toBe(false);
    expect(stepDone({ ...blank, title: "Quote" }, { customers }, 2)).toBe(true);
  });
});

describe("the one big button", () => {
  const base = { step: 0, editing: false, complete: false, conflict: false, chosenWho: false };

  it("walks forward until there is enough, then says Book visit", () => {
    expect(primaryAction(base)).toEqual({ label: "Skip, walk-in", mode: "next" });
    expect(primaryAction({ ...base, chosenWho: true })).toEqual({ label: "Next: When", mode: "next" });
    expect(primaryAction({ ...base, step: 1 })).toEqual({ label: "Next: What for", mode: "next" });
    expect(primaryAction({ ...base, step: 2 })).toEqual({ label: "Book visit", mode: "save" });
    expect(primaryAction({ ...base, complete: true })).toEqual({ label: "Book visit", mode: "save" });
  });

  it("says Save changes when editing", () => {
    expect(primaryAction({ ...base, editing: true, complete: true, step: 1 })).toEqual({ label: "Save changes", mode: "save" });
  });

  it("turns into Book anyway after the already-booked warning, on any step", () => {
    for (const step of [0, 1, 2]) {
      expect(primaryAction({ ...base, step, complete: true, conflict: true })).toEqual({ label: "Book anyway", mode: "overlap" });
    }
  });
});

describe("a phone's keyboard", () => {
  it("is nothing while only the browser bars move", () => {
    expect(keyboardBox(844, { height: 844, offsetTop: 0 })).toBeNull();
    expect(keyboardBox(844, { height: 790, offsetTop: 0 })).toBeNull();
  });

  it("leaves the sheet the part of the screen above the keyboard", () => {
    expect(keyboardBox(844, { height: 520.4, offsetTop: 0 })).toEqual({ top: 0, height: 520 });
    expect(keyboardBox(844, { height: 520, offsetTop: 36.6 })).toEqual({ top: 37, height: 520 });
    expect(keyboardBox(844, { height: 520, offsetTop: -3 })).toEqual({ top: 0, height: 520 });
  });
});
