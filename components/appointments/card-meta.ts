/**
 * What an Easy-mode appointment card says, worked out in one place.
 *
 * Pure (no React, no `db`, no `next/*`) so the words on a card can be tested
 * without rendering one. The card itself is `appointment-cards.tsx`.
 *
 * A card shows: the start time as the big leading text, the customer's name,
 * what the visit is for, the status in words, and at most three small facts.
 * Times are read on the shop's wall clock when its zone is given.
 */

import { addDays, format } from "date-fns";

import {
  asAppointmentStatus,
  customerNameOf,
  timeRange,
  toDateParam,
  todayIn,
  wallHourMinute,
  type CalendarAppointment,
} from "./calendar-meta";

/** The heading over a day's cards: "Today" / "Tomorrow" / "Monday", plus the date. */
export function dayHeading(
  day: Date,
  now: Date,
  zone?: string,
): { main: string; sub: string; today: boolean } {
  const today = todayIn(now, zone);
  const key = toDateParam(day);
  if (key === toDateParam(today)) {
    return { main: "Today", sub: format(day, "EEEE, MMMM d"), today: true };
  }
  if (key === toDateParam(addDays(today, 1))) {
    return { main: "Tomorrow", sub: format(day, "EEEE, MMMM d"), today: false };
  }
  return { main: format(day, "EEEE"), sub: format(day, "MMMM d"), today: false };
}

export type CardFact = {
  key: "range" | "tech" | "ticket" | "location";
  text: string;
};

export type AppointmentCardParts = {
  /** "9:00" - the big leading text. */
  hour: string;
  /** "AM" - small, under the hour. */
  period: string;
  /** The customer's name, or the booking's own title when nobody is attached. */
  title: string;
  /** What the visit is for (or the notes, when there is no customer). */
  subtitle: string | null;
  /** Three at most: time range, who, then the repair or the place. */
  facts: CardFact[];
  canceled: boolean;
  /** Done or canceled: the card is drawn quieter than one still to come. */
  settled: boolean;
};

export function appointmentCardParts(
  appointment: CalendarAppointment,
  zone?: string,
): AppointmentCardParts {
  const customer = customerNameOf(appointment.customer);
  const status = asAppointmentStatus(appointment.status);

  const facts: CardFact[] = [
    { key: "range", text: timeRange(appointment.startsAt, appointment.endsAt, zone) },
    { key: "tech", text: appointment.assignedTo?.name ?? "Unassigned" },
  ];
  if (appointment.ticket) {
    facts.push({ key: "ticket", text: `Repair #${appointment.ticket.number}` });
  } else if (appointment.location) {
    facts.push({ key: "location", text: appointment.location.name });
  }

  const { hour, minute } = wallHourMinute(appointment.startsAt, zone);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return {
    hour: `${twelve}:${String(minute).padStart(2, "0")}`,
    period: hour < 12 ? "AM" : "PM",
    title: customer ?? appointment.title,
    subtitle: customer ? appointment.title : (appointment.notes?.trim() || null),
    facts,
    canceled: status === "CANCELED",
    settled: status !== "SCHEDULED",
  };
}

/**
 * A word for where a visit is in its day, beside its status: "Happening now"
 * while it runs, "Next" for the first one still to come today. null otherwise.
 * Only for a booking still SCHEDULED: a done or canceled one says so already.
 */
export function visitMoment(
  appointment: Pick<CalendarAppointment, "id" | "startsAt" | "endsAt" | "status">,
  now: Date,
  nextId: string | null,
): "Happening now" | "Next" | null {
  if (asAppointmentStatus(appointment.status) !== "SCHEDULED") return null;
  if (appointment.startsAt <= now && appointment.endsAt > now) return "Happening now";
  if (appointment.id === nextId) return "Next";
  return null;
}
