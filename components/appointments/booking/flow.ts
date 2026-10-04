/**
 * The Easy-mode "Book a visit" flow, as plain data and plain functions.
 *
 * Same idea as the repair check-in (components/tickets/intake/flow.ts): what has
 * been chosen, what each step has to say about it, what is still missing and
 * what the one big button should say all live here, so they can be tested
 * without a browser. The components only draw this and call the transitions.
 *
 * What the dialog POSTS is not decided here. The state is the same
 * AppointmentFormValues the dense dialog has always held, and the request is
 * built by `appointmentFormData` (appointment-state.ts) for both.
 *
 * Pure on purpose: no React, no next/*, no database.
 */

import { addDays, format, isSameDay } from "date-fns";

import { contactFromQuery, matchesCustomer, type SearchCustomer } from "@/lib/customers/search-options";
import type {
  AppointmentFormValues,
  AppointmentPickers,
  CustomerOption,
  CustomerSearchResult,
} from "../appointment-state";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  parseLocalDateTime,
  shortTime,
  toDateParam,
} from "../calendar-meta";
import { NONE } from "../dialog-meta";

// ---------------------------------------------------------------------------
// Vocabulary shared with saveAppointmentAction
// ---------------------------------------------------------------------------

/** `customerId` while booking someone who is not a customer yet. */
export const NEW = "new";

export type BookingContext = Pick<AppointmentPickers, "customers" | "ticketsByCustomer" | "techs" | "locations">;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const STEPS = [
  { label: "Who", title: "Who is coming in?", hint: "Search by name or phone number, or add someone new. Skip it for a walk-in." },
  { label: "When", title: "When?", hint: "" },
  { label: "What for", title: "What is it for?", hint: "Tap the closest match." },
] as const;
export const LAST_STEP = STEPS.length - 1;

/**
 * A new visit starts on Who. An existing one is usually being moved, so it
 * opens on When, and so does a new one that came with its customer already
 * chosen ("Book a visit" on a customer's page).
 */
export function initialStep(values: Pick<AppointmentFormValues, "id"> & { customerId?: string }): number {
  if (values.id) return 1;
  return values.customerId && values.customerId !== NONE ? 1 : 0;
}

/**
 * Where the cursor goes when the dialog opens or a step comes up. The first step's search box takes it
 * itself, but only where there is a keyboard and it really is on screen. Anywhere else (Edit visit
 * opens on When, a touch screen keeps its keyboard down, somebody was already chosen) the heading
 * takes it, so focus is always inside the dialog: Tab and a screen reader start at the step instead
 * of on the page behind the overlay. The heading is not a field, so no keyboard comes up on a phone.
 */
export function stepFocus(input: { step: number; finePointer: boolean; fieldHasCursor: boolean }): "field" | "heading" {
  return input.step === 0 && input.finePointer && input.fieldHasCursor ? "field" : "heading";
}

// ---------------------------------------------------------------------------
// What the visit is for
// ---------------------------------------------------------------------------

export type VisitKind = "dropoff" | "pickup" | "quote" | "checkin" | "other";

export type VisitTile = { kind: VisitKind; label: string; detail: string; photo: string };

/** The boxes on the last step. The label is also what becomes the booking's title. */
export const VISIT_KINDS: VisitTile[] = [
  { kind: "dropoff", label: "Drop-off", detail: "Bringing a device in", photo: "/images/products/phone.webp" },
  { kind: "pickup", label: "Pick-up", detail: "Collecting a repair", photo: "/images/home/pickup-bag.webp" },
  { kind: "quote", label: "Quote", detail: "Wants a price", photo: "/images/home/price-tag.webp" },
  { kind: "checkin", label: "Repair check-in", detail: "Starting a repair", photo: "/images/home/toolbox.webp" },
  { kind: "other", label: "Other", detail: "Say what it is", photo: "/images/home/diary.webp" },
];

function labelOf(kind: VisitKind): string {
  return VISIT_KINDS.find((tile) => tile.kind === kind)?.label ?? "";
}

/**
 * Which box a saved title belongs to. A title that is exactly a box's name is
 * that box; anything else somebody wrote is "Other", so editing an old booking
 * shows its own words instead of losing them.
 */
export function kindOfTitle(title: string): VisitKind | "" {
  const text = title.trim().toLowerCase();
  if (!text) return "";
  const match = VISIT_KINDS.find((tile) => tile.kind !== "other" && tile.label.toLowerCase() === text);
  return match?.kind ?? "other";
}

/**
 * Tapping a box writes the title for you: "Drop-off". A title somebody typed is
 * never overwritten; only an empty one or the previous box's own name is.
 * "Other" empties it, because "Other" is not a title.
 */
export function withKind(
  values: AppointmentFormValues,
  from: VisitKind | "",
  to: VisitKind,
): AppointmentFormValues {
  const title = values.title.trim();
  const automatic = title === "" || (from !== "" && from !== "other" && title === labelOf(from));
  if (!automatic) return values;
  return { ...values, title: to === "other" ? "" : labelOf(to) };
}

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

/** The picker's customers, in the shape the shared contact search works on. */
export function searchable(customers: CustomerOption[]): SearchCustomer[] {
  return customers.map((customer) => ({
    id: customer.value,
    label: customer.label,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
  }));
}

/**
 * The page's customers plus the ones the server search found (a shop with more
 * than the page sends). People already on the list keep their place, the found
 * ones follow; a found person's repairs come along so one can be linked.
 */
export function withFoundCustomers<T extends Pick<BookingContext, "customers" | "ticketsByCustomer">>(
  ctx: T,
  found: CustomerSearchResult,
): T {
  if (found.customers.length === 0) return ctx;
  const known = new Set(ctx.customers.map((customer) => customer.value));
  const extra = found.customers.filter((customer) => !known.has(customer.value));
  if (extra.length === 0) return ctx;
  return {
    ...ctx,
    customers: [...ctx.customers, ...extra],
    ticketsByCustomer: { ...found.ticketsByCustomer, ...ctx.ticketsByCustomer },
  };
}

/** Two server answers as one: the later one's people added after the earlier one's. */
export function mergeFound(earlier: CustomerSearchResult, later: CustomerSearchResult): CustomerSearchResult {
  const known = new Set(earlier.customers.map((customer) => customer.value));
  return {
    customers: [...earlier.customers, ...later.customers.filter((customer) => !known.has(customer.value))],
    ticketsByCustomer: { ...later.ticketsByCustomer, ...earlier.ticketsByCustomer },
  };
}

export function findCustomers(customers: CustomerOption[], query: string): CustomerOption[] {
  const text = query.trim();
  if (!text) return [];
  return customers.filter((customer) =>
    matchesCustomer(
      { id: customer.value, label: customer.label, phone: customer.phone ?? null, email: customer.email ?? null },
      text,
    ),
  );
}

/**
 * Can a number or an address find anybody? Only when the page sent them. A page that sends names alone
 * can still book a number (the New customer box carries it and the server matches it to a saved
 * customer), but the search box must not claim it looked.
 */
export function searchesByContact(customers: CustomerOption[]): boolean {
  return customers.some((customer) => Boolean(customer.phone || customer.email));
}

/** The line under "Who is coming in?", true to what the search box can do with the customers it was given. */
export function whoHint(customers: CustomerOption[]): string {
  return searchesByContact(customers)
    ? STEPS[0].hint
    : "Search by name, or add someone new. Skip it for a walk-in.";
}

/** What the search box can be typed into, in the words of the placeholder. */
export function searchPlaceholder(customers: CustomerOption[]): string {
  return searchesByContact(customers) ? "Name or phone number" : "Customer name";
}

/**
 * The line when nobody matches. "Nobody on file" is only said when the search really did look at the
 * typed thing; a number or address the list cannot be searched by is passed on to the booking instead.
 */
export function noMatchLine(customers: CustomerOption[], typed: string): string {
  const text = typed.trim();
  if (!searchesByContact(customers)) {
    const contact = contactFromQuery(text);
    if (contact.phone) return "No name matches. Numbers are checked when you book. Tap New customer.";
    if (contact.email) return "No name matches. Emails are checked when you book. Tap New customer.";
  }
  return `Nobody on file matches “${text}”.`;
}

/** Choosing somebody else forgets the repair linked to the last person: it was theirs. */
export function withCustomer(values: AppointmentFormValues, id: string): AppointmentFormValues {
  if (id === values.customerId) return values;
  return {
    ...values,
    customerId: id,
    newCustomerName: "",
    newCustomerPhone: "",
    newCustomerEmail: "",
    ticketId: NONE,
  };
}

/** "New customer", seeded from what was typed in the search box: a number, an email or a name. */
export function withNewCustomer(values: AppointmentFormValues, typed: string): AppointmentFormValues {
  const contact = typed.trim() ? contactFromQuery(typed) : { name: "", phone: "", email: "" };
  return {
    ...values,
    customerId: NEW,
    newCustomerName: contact.name,
    newCustomerPhone: contact.phone,
    newCustomerEmail: contact.email,
    ticketId: NONE,
  };
}

export function withNewPerson(
  values: AppointmentFormValues,
  patch: Partial<{ name: string; phone: string; email: string }>,
): AppointmentFormValues {
  return {
    ...values,
    ...(patch.name !== undefined ? { newCustomerName: patch.name } : {}),
    ...(patch.phone !== undefined ? { newCustomerPhone: patch.phone } : {}),
    ...(patch.email !== undefined ? { newCustomerEmail: patch.email } : {}),
  };
}

/**
 * How a person reads in the picker. A customer saved with only a number is
 * named "Customer 5125550142" (lib/intake.ts), which reads like a mistake in a
 * list of names: such a row leads with the number and says no name is saved.
 */
export function pickerLines(customer: CustomerOption): { title: string; detail: string } {
  const contact = customer.phone || customer.email || "";
  if (/^Customer [\d\s()+.-]+$/.test(customer.label.trim())) {
    return { title: contact || customer.label.replace(/^Customer\s+/, ""), detail: "No name saved yet" };
  }
  return { title: customer.label, detail: contact };
}

/** "Daniel Reed", the new person's name or number, "Saved customer" when the list lacks them, or "". */
export function customerName(values: AppointmentFormValues, ctx: Pick<BookingContext, "customers">): string {
  if (values.customerId === NEW) {
    return (values.newCustomerName ?? "").trim() || (values.newCustomerPhone ?? "").trim();
  }
  if (!values.customerId || values.customerId === NONE) return "";
  return ctx.customers.find((customer) => customer.value === values.customerId)?.label ?? "Saved customer";
}

export function hasCustomer(values: AppointmentFormValues): boolean {
  return values.customerId !== "" && values.customerId !== NONE;
}

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

export type QuickDay = { key: "today" | "tomorrow" | "week"; label: string; date: string; detail: string };

/** Today / Tomorrow / Next week, each with the date it means, so there is nothing to guess. */
export function quickDays(now: Date): QuickDay[] {
  const spell = (day: Date) => format(day, "EEE, MMM d");
  return [
    { key: "today", label: "Today", date: toDateParam(now), detail: spell(now) },
    { key: "tomorrow", label: "Tomorrow", date: toDateParam(addDays(now, 1)), detail: spell(addDays(now, 1)) },
    { key: "week", label: "Next week", date: toDateParam(addDays(now, 7)), detail: spell(addDays(now, 7)) },
  ];
}

/**
 * The shop's usual slot: the calendar's rows are hours and a new booking is an
 * hour long, so the time boxes are one per hour across the calendar's day.
 * Anything else goes in the "Other time" box.
 */
export const SLOT_MINUTES = 60;

export type Slot = { value: string; label: string };

export function timeSlots(
  stepMinutes: number = SLOT_MINUTES,
  fromHour: number = DAY_START_HOUR,
  toHour: number = DAY_END_HOUR,
): Slot[] {
  const slots: Slot[] = [];
  for (let minute = fromHour * 60; minute < toHour * 60; minute += stepMinutes) {
    const hours = Math.floor(minute / 60);
    const minutes = minute % 60;
    slots.push({
      value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      label: shortTime(new Date(2000, 0, 1, hours, minutes)),
    });
  }
  return slots;
}

export type DurationChip = { value: string; label: string };

export const QUICK_DURATIONS: DurationChip[] = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "60 min" },
];

/** What the old duration list had beyond 30 and 60: still there, one tap behind "Longer". */
export const LONGER_DURATIONS: DurationChip[] = [
  { value: "90", label: "1½ hours" },
  { value: "120", label: "2 hours" },
  { value: "custom", label: "End time" },
];

export function isLongerDuration(duration: string): boolean {
  return !QUICK_DURATIONS.some((chip) => chip.value === duration);
}

function startOf(values: Pick<AppointmentFormValues, "startDate" | "startTime">): Date | null {
  return parseLocalDateTime(`${values.startDate}T${values.startTime}`);
}

/** When the visit ends, or null while the end is unknown or not after the start. */
export function endOf(
  values: Pick<AppointmentFormValues, "startDate" | "startTime" | "duration" | "endTime">,
): Date | null {
  const start = startOf(values);
  if (!start) return null;
  if (values.duration === "custom") {
    const end = parseLocalDateTime(`${values.startDate}T${values.endTime}`);
    return end && end > start ? end : null;
  }
  const minutes = Number.parseInt(values.duration, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(start.getTime() + minutes * 60_000);
}

/** "10:30" plus 60 minutes is "11:30"; it stops at 23:59 rather than wrapping into the next day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const parts = /^(\d{2}):(\d{2})/.exec(time);
  if (!parts) return time;
  const total = Math.min(23 * 60 + 59, Number(parts[1]) * 60 + Number(parts[2]) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Opening a booking: a custom end time that is exactly 15 minutes after the
 * start is the "15 min" box (the page only knows the older presets, so it sends
 * those as custom). Posting is unchanged either way: the server gets the same
 * start and end.
 */
export function normalizeDuration(values: AppointmentFormValues): AppointmentFormValues {
  if (values.duration !== "custom") return values;
  const start = startOf(values);
  const end = parseLocalDateTime(`${values.startDate}T${values.endTime}`);
  if (start && end && end.getTime() - start.getTime() === 15 * 60_000) {
    return { ...values, duration: "15" };
  }
  return values;
}

export function withDuration(values: AppointmentFormValues, duration: string): AppointmentFormValues {
  const next = { ...values, duration };
  if (duration === "custom") {
    const start = startOf(values);
    const end = parseLocalDateTime(`${values.startDate}T${values.endTime}`);
    // Never land on an end that is not after the start: begin an hour in.
    if (!start || !end || end <= start) next.endTime = addMinutesToTime(values.startTime, SLOT_MINUTES);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Validation: the same rules as the server, in plain words, tied to a step
// ---------------------------------------------------------------------------

export type Issue = { step: number; field: string; message: string };

export const MSG = {
  contact: "Add a name or a phone number.",
  email: "That email doesn't look right — fix it or leave it blank.",
  when: "Pick a start date and time.",
  endTime: "Pick an end time.",
  endAfter: "The end time has to be after the start time.",
  title: "Choose what the visit is for.",
  titleOther: "Say what the visit is for in a few words.",
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(values: AppointmentFormValues, kind: VisitKind | ""): Issue[] {
  const issues: Issue[] = [];

  if (values.customerId === NEW) {
    const name = (values.newCustomerName ?? "").trim();
    const phone = (values.newCustomerPhone ?? "").trim();
    const email = (values.newCustomerEmail ?? "").trim();
    if (!name && !phone) issues.push({ step: 0, field: "newCustomerName", message: MSG.contact });
    if (email && !EMAIL.test(email)) issues.push({ step: 0, field: "newCustomerEmail", message: MSG.email });
  }

  const start = startOf(values);
  if (!start) {
    issues.push({ step: 1, field: "startTime", message: MSG.when });
  } else if (values.duration === "custom") {
    const end = parseLocalDateTime(`${values.startDate}T${values.endTime}`);
    if (!end) issues.push({ step: 1, field: "endTime", message: MSG.endTime });
    else if (end <= start) issues.push({ step: 1, field: "endTime", message: MSG.endAfter });
  }

  if (!values.title.trim()) {
    issues.push({ step: 2, field: "title", message: kind === "other" ? MSG.titleOther : MSG.title });
  }

  return issues;
}

/** The first thing still in the way of booking, in plain words, or null. */
export function blocker(values: AppointmentFormValues, kind: VisitKind | ""): Issue | null {
  return validate(values, kind)[0] ?? null;
}

/**
 * Which step a refusal from saveAppointmentAction belongs to, so it lands where
 * it can be fixed. null keeps you where you are (a clash is fixed from any step,
 * "not found" is nobody's fault).
 */
export function stepForServerError(message: string): number | null {
  if (/name or a phone|email|customer/i.test(message)) return 0;
  if (/start date|end time|how long|date and time/i.test(message)) return 1;
  if (/title/i.test(message)) return 2;
  return null;
}

// ---------------------------------------------------------------------------
// The summary strip and the stepper
// ---------------------------------------------------------------------------

/** "10–11 AM", "10:30–11:30 AM", "11 AM – 1 PM": the shortest honest way to say a range. */
export function compactRange(start: Date, end: Date): string {
  if (format(start, "a") !== format(end, "a")) return `${shortTime(start)} – ${shortTime(end)}`;
  return `${format(start, start.getMinutes() === 0 ? "h" : "h:mm")}–${shortTime(end)}`;
}

/** The day and the time of the visit, separately: "Tomorrow" and "10–11 AM". null before a time is chosen. */
export function whenParts(values: AppointmentFormValues, now: Date): { day: string; time: string } | null {
  const start = startOf(values);
  if (!start) return null;
  const end = endOf(values);
  const day = isSameDay(start, now)
    ? "Today"
    : isSameDay(start, addDays(now, 1))
      ? "Tomorrow"
      : format(start, "EEE, MMM d");
  return { day, time: end ? compactRange(start, end) : shortTime(start) };
}

/** "Today, 10–11 AM", "Tomorrow, 2 PM", "Fri, Oct 10, 9–9:30 AM", or "" before a time is chosen. */
export function whenLabel(values: AppointmentFormValues, now: Date): string {
  const parts = whenParts(values, now);
  return parts ? `${parts.day}, ${parts.time}` : "";
}

export type SummaryPart = { label: string; value: string; detail?: string; empty: string; step: number };

/** Who - When - What: what is chosen so far, each with the step that changes it. */
export function summaryParts(
  values: AppointmentFormValues,
  ctx: Pick<BookingContext, "customers">,
  now: Date,
): SummaryPart[] {
  const when = whenParts(values, now);
  return [
    { label: "Who", value: customerName(values, ctx), empty: "Walk-in", step: 0 },
    { label: "When", value: when?.day ?? "", detail: when?.time, empty: "Not set", step: 1 },
    { label: "What", value: values.title.trim(), empty: "Not chosen", step: 2 },
  ];
}

/** A tick on the step's tab once it holds a real choice. Who is optional, so it ticks only when someone was chosen. */
export function stepDone(values: AppointmentFormValues, ctx: Pick<BookingContext, "customers">, step: number): boolean {
  const problems = validate(values, "");
  if (step === 0) {
    return customerName(values, ctx) !== "" && !problems.some((issue) => issue.step === 0);
  }
  if (step === 1) return !problems.some((issue) => issue.step === 1);
  return values.title.trim() !== "";
}

// ---------------------------------------------------------------------------
// The one big button
// ---------------------------------------------------------------------------

export type Primary = { label: string; mode: "next" | "save" | "overlap" };

/**
 * What the one black button says and does:
 *   - after a clash: "Book anyway" (it sends the same booking with the override);
 *   - once everything needed is there: "Book visit" / "Save changes", from any step;
 *   - until then: "Next: ..." to the following step, and on the last one the
 *     same "Book visit", which says what is missing when pressed too early.
 */
export function primaryAction(input: {
  step: number;
  editing: boolean;
  complete: boolean;
  conflict: boolean;
  chosenWho: boolean;
}): Primary {
  const save = input.editing ? "Save changes" : "Book visit";
  if (input.conflict) return { label: "Book anyway", mode: "overlap" };
  if (input.complete) return { label: save, mode: "save" };
  if (input.step >= LAST_STEP) return { label: save, mode: "save" };
  if (input.step === 0) return { label: input.chosenWho ? "Next: When" : "Skip, walk-in", mode: "next" };
  return { label: `Next: ${STEPS[input.step + 1].label}`, mode: "next" };
}
