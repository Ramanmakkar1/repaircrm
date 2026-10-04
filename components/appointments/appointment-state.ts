/**
 * Return shapes for the appointment server actions, and the booking dialog's
 * own shapes (what it is given, what it posts).
 *
 * Outside `actions.ts` on purpose: a `"use server"` module may only export
 * async functions, so types and constants cannot ship from there.
 */

import { NONE } from "./dialog-meta";

/** The booking we would be double-booking a tech into. */
export type AppointmentConflict = {
  id: string;
  title: string;
  /** Pre-formatted for display — the client never re-parses a timestamp. */
  when: string;
  techName: string;
  customerName: string | null;
};

/**
 * `conflict` is a WARNING, not a rejection: shops double-book on purpose all the
 * time (a 10-minute pickup during a 2-hour bench job). The action refuses once,
 * hands back what it would collide with, and goes through on the retry with
 * `confirmOverlap`.
 */
export type AppointmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; conflict?: undefined }
  | { ok: false; error: string; conflict: AppointmentConflict };

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** Options for the customer / ticket / tech / location pickers. */
export type Option = { value: string; label: string };

/**
 * A customer in the booking picker. The label is all the old picker needed;
 * `phone` and `email` let the Easy-mode search find someone by number too, when
 * the page sends them (it may leave them out and search is by name only).
 */
export type CustomerOption = Option & {
  phone?: string | null;
  email?: string | null;
};

export type AppointmentPickers = {
  customers: CustomerOption[];
  /** Only the tickets belonging to each customer — one query at page load. */
  ticketsByCustomer: Record<string, Option[]>;
  techs: Option[];
  locations: Option[];
};

export type AppointmentFormValues = {
  id: string | null;
  title: string;
  /** "" none yet, an id, or "new" while booking someone who is not a customer yet. */
  customerId: string;
  /** Filled when `customerId` is "new" — a first-time caller booked from here. */
  newCustomerName?: string;
  newCustomerPhone?: string;
  newCustomerEmail?: string;
  /** Undefined reads as yes: the box starts ticked, and unticking is the act. */
  newCustomerSmsOk?: boolean;
  ticketId: string;
  assignedToId: string;
  locationId: string;
  /** Pre-formatted yyyy-MM-dd / HH:mm so the inputs never re-parse a timestamp. */
  startDate: string;
  startTime: string;
  duration: string;
  endTime: string;
  notes: string;
  /**
   * "Sep 1, 9:14 AM" when the reminder has already gone out, null otherwise.
   * Pre-formatted on the server so the dialog never reaches for its own clock.
   */
  reminderSentLabel?: string | null;
};

/**
 * Every field `saveAppointmentAction` reads, exactly as the booking dialog has
 * always posted them. Both dialogs (the dense one in Full mode and the Easy-mode
 * flow) build their request here, so they can never drift apart on what the
 * server is sent. `tests/booking-formdata.test.ts` pins it against the original
 * inline code, field for field.
 */
export function appointmentFormData(
  values: AppointmentFormValues,
  confirmOverlap: boolean,
): FormData {
  const formData = new FormData();
  formData.set("title", values.title);
  formData.set("customerId", values.customerId || NONE);
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
