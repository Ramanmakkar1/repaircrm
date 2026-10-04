import { describe, expect, it } from "vitest";

import {
  appointmentFormData,
  type AppointmentFormValues,
} from "@/components/appointments/appointment-state";
import {
  NEW,
  kindOfTitle,
  normalizeDuration,
  withCustomer,
  withDuration,
  withKind,
  withNewCustomer,
  withNewPerson,
} from "@/components/appointments/booking/flow";

/**
 * The Easy-mode "Book a visit" flow must send the server exactly what the
 * dialog has always sent, field for field: same names, same values, same order.
 *
 * `oldDialogFormData` is the original inline code of `save()` in
 * appointment-dialog.tsx, copied verbatim before it was replaced by the shared
 * `appointmentFormData`. It is frozen here on purpose: it is the reference the
 * new builder is held to, and it must not be "fixed" along with the code.
 */
function oldDialogFormData(values: AppointmentFormValues, confirmOverlap: boolean): FormData {
  const formData = new FormData();
  formData.set("title", values.title);
  formData.set("customerId", values.customerId || "none");
  formData.set("newCustomerName", values.newCustomerName ?? "");
  formData.set("newCustomerPhone", values.newCustomerPhone ?? "");
  formData.set("newCustomerEmail", values.newCustomerEmail ?? "");
  if (values.newCustomerSmsOk !== false) formData.set("newCustomerSmsOk", "on");
  formData.set("ticketId", values.ticketId);
  formData.set("assignedToId", values.assignedToId);
  formData.set("locationId", values.locationId);
  formData.set("startDate", values.startDate);
  formData.set("startTime", values.startTime);
  formData.set("duration", values.duration);
  formData.set("endTime", values.endTime);
  formData.set("notes", values.notes);
  if (confirmOverlap) formData.set("confirmOverlap", "on");
  return formData;
}

const entries = (data: FormData) => [...data.entries()];

/** What the Appointments page hands a blank booking (defaultFormValues in page.tsx). */
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

/** What the page hands an existing booking (valuesFromAppointment in page.tsx). */
const existing: AppointmentFormValues = {
  id: "appt_1",
  title: "Screen swap drop-off",
  customerId: "cus_1",
  ticketId: "tkt_9",
  assignedToId: "usr_2",
  locationId: "loc_1",
  startDate: "2026-10-06",
  startTime: "10:30",
  duration: "90",
  endTime: "12:00",
  notes: "Bringing the charger too.",
  reminderSentLabel: "Oct 5, 9:14 AM",
};

const cases: [string, AppointmentFormValues][] = [
  ["a blank booking", blank],
  ["an existing booking", existing],
  ["a custom length", { ...existing, duration: "custom", endTime: "11:45" }],
  ["a first-time caller", { ...blank, customerId: "new", newCustomerName: "Dana Cole", newCustomerPhone: "780-555-0142", newCustomerEmail: "dana@example.com" }],
  ["a first-time caller who said no to texts", { ...blank, customerId: "new", newCustomerPhone: "780-555-0142", newCustomerSmsOk: false }],
  ["notes with odd characters", { ...existing, notes: "Café \"back door\"\nline two & more" }],
];

describe("the booking request is unchanged", () => {
  for (const [name, values] of cases) {
    for (const confirmOverlap of [false, true]) {
      it(`${name}${confirmOverlap ? " (book anyway)" : ""} posts the same fields as the old dialog`, () => {
        expect(entries(appointmentFormData(values, confirmOverlap))).toEqual(
          entries(oldDialogFormData(values, confirmOverlap)),
        );
      });
    }
  }

  it("posts no customer as the word none, as before", () => {
    expect(appointmentFormData(blank, false).get("customerId")).toBe("none");
  });

  it("only posts the overlap override when it is asked for", () => {
    expect(appointmentFormData(blank, false).has("confirmOverlap")).toBe(false);
    expect(appointmentFormData(blank, true).get("confirmOverlap")).toBe("on");
  });
});

describe("what the Easy-mode steps put in the request", () => {
  it("a new booking made by tapping through the steps", () => {
    // Who: a number typed in the search box becomes the new customer's phone.
    let values = withNewCustomer(blank, "780-555-0142");
    // When: Tomorrow, 10 AM, 30 min.
    values = { ...values, startDate: "2026-10-04", startTime: "10:00" };
    values = withDuration(values, "30");
    // What for: the Drop-off box writes the title.
    values = withKind(values, "", "dropoff");

    expect(Object.fromEntries(appointmentFormData(values, false))).toEqual({
      title: "Drop-off",
      customerId: "new",
      newCustomerName: "",
      newCustomerPhone: "780-555-0142",
      newCustomerEmail: "",
      newCustomerSmsOk: "on",
      ticketId: "none",
      assignedToId: "none",
      locationId: "none",
      startDate: "2026-10-04",
      startTime: "10:00",
      duration: "30",
      endTime: "16:00",
      notes: "",
    });
    expect(entries(appointmentFormData(values, false))).toEqual(entries(oldDialogFormData(values, false)));
  });

  it("a name-only new customer is enough, and unticking texts is posted as before", () => {
    let values = withNewCustomer(blank, "Dana Cole");
    values = { ...values, newCustomerSmsOk: false };
    values = withKind(values, "", "quote");
    const posted = Object.fromEntries(appointmentFormData(values, false));
    expect(posted.customerId).toBe(NEW);
    expect(posted.newCustomerName).toBe("Dana Cole");
    expect(posted.newCustomerPhone).toBe("");
    expect(posted).not.toHaveProperty("newCustomerSmsOk");
    expect(posted.title).toBe("Quote");
  });

  it("an existing customer posts their id and blank new-customer fields", () => {
    const values = withKind(withCustomer(blank, "cus_7"), "", "pickup");
    expect(Object.fromEntries(appointmentFormData(values, false))).toMatchObject({
      customerId: "cus_7",
      newCustomerName: "",
      newCustomerPhone: "",
      newCustomerEmail: "",
      title: "Pick-up",
    });
  });

  it("opening an existing booking and saving it untouched posts what the old dialog would", () => {
    // The flow opens a booking through normalizeDuration; with nothing changed the request is identical.
    const opened = normalizeDuration(existing);
    expect(entries(appointmentFormData(opened, false))).toEqual(entries(oldDialogFormData(existing, false)));
    // Its custom title is kept as typed, not turned into a box's name.
    expect(kindOfTitle(existing.title)).toBe("other");
    expect(withKind(opened, "other", "other").title).toBe("Screen swap drop-off");
  });

  it("an edit that moves the booking changes only the time fields", () => {
    const moved = { ...existing, startDate: "2026-10-07", startTime: "14:00" };
    const before = Object.fromEntries(appointmentFormData(existing, false));
    const after = Object.fromEntries(appointmentFormData(moved, false));
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    expect(changed.sort()).toEqual(["startDate", "startTime"]);
  });

  it("a 15 minute booking opened from the page's 'custom' is posted as the same start and end", () => {
    const fromPage: AppointmentFormValues = { ...existing, duration: "custom", startTime: "10:00", endTime: "10:15" };
    const opened = normalizeDuration(fromPage);
    expect(opened.duration).toBe("15");
    expect(opened.startTime).toBe("10:00");
    // 10:00 + 15 min is the end the old dialog posted as a custom 10:15.
    expect(withDuration(opened, "custom").endTime).toBe("10:15");
  });

  it("choosing a new person in the flow keeps the typed fields and drops the old repair", () => {
    const values = withNewPerson(withNewCustomer({ ...existing, ticketId: "tkt_9" }, ""), { name: "Sam", phone: "5550100" });
    expect(values.ticketId).toBe("none");
    expect(Object.fromEntries(appointmentFormData(values, false))).toMatchObject({
      customerId: "new",
      newCustomerName: "Sam",
      newCustomerPhone: "5550100",
    });
  });
});
