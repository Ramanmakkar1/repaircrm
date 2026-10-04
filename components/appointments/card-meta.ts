/**
 * What an Easy-mode appointment card says, worked out in one place.
 *
 * Pure (no React, no `db`, no `next/*`) so the words on a card can be tested
 * without rendering one. The card itself is `appointment-cards.tsx`.
 *
 * A card shows: the start time as the big leading text, the customer's name,
 * what the visit is for, the status in words, and at most three small facts.
 */

import { addDays, format, isSameDay } from "date-fns";

import {
  asAppointmentStatus,
  customerNameOf,
  timeRange,
  type CalendarAppointment,
} from "./calendar-meta";

/** The heading over a day's cards: "Today" / "Tomorrow" / "Monday", plus the date. */
export function dayHeading(
  day: Date,
  now: Date,
): { main: string; sub: string; today: boolean } {
  if (isSameDay(day, now)) {
    return { main: "Today", sub: format(day, "EEEE, MMMM d"), today: true };
  }
  if (isSameDay(day, addDays(now, 1))) {
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
};

export function appointmentCardParts(
  appointment: CalendarAppointment,
): AppointmentCardParts {
  const customer = customerNameOf(appointment.customer);

  const facts: CardFact[] = [
    { key: "range", text: timeRange(appointment.startsAt, appointment.endsAt) },
    { key: "tech", text: appointment.assignedTo?.name ?? "Unassigned" },
  ];
  if (appointment.ticket) {
    facts.push({ key: "ticket", text: `Repair #${appointment.ticket.number}` });
  } else if (appointment.location) {
    facts.push({ key: "location", text: appointment.location.name });
  }

  return {
    hour: format(appointment.startsAt, "h:mm"),
    period: format(appointment.startsAt, "a"),
    title: customer ?? appointment.title,
    subtitle: customer ? appointment.title : (appointment.notes?.trim() || null),
    facts,
    canceled: asAppointmentStatus(appointment.status) === "CANCELED",
  };
}
