/**
 * The Easy-mode calendar as plain data: the day strip across the top, the
 * day's hour-by-hour list and the week's day groups.
 *
 * Pure (no React, no `db`, no `next/*`) so what the counter sees can be tested
 * without rendering a page. Every instant is read on the shop's wall clock when
 * its zone is given; the days themselves are calendar days (see calendar-meta).
 */

import { format } from "date-fns";

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  asAppointmentStatus,
  dayKeyOfInstant,
  hourLabel,
  slotParam,
  toDateParam,
  todayIn,
  wallHourMinute,
  type CalendarAppointment,
} from "./calendar-meta";

/** A booking that still takes up the diary: canceled ones are history. */
export function countsAsVisit(appointment: Pick<CalendarAppointment, "status">): boolean {
  return asAppointmentStatus(appointment.status) !== "CANCELED";
}

// ---------------------------------------------------------------------------
// The day strip
// ---------------------------------------------------------------------------

export type StripDay = {
  /** "2026-10-04". */
  key: string;
  /** "Mon", or "Today" for today: the word, not only a highlight. */
  label: string;
  /** "Oct 4". */
  date: string;
  /** Bookings that are not canceled. */
  visits: number;
  isToday: boolean;
  selected: boolean;
};

/** One chip per day of the week on screen, with how many visits each holds. */
export function stripDays(input: {
  days: Date[];
  appointments: readonly CalendarAppointment[];
  now: Date;
  zone?: string;
  /** The day the Day view is showing; null in the week views. */
  selectedKey: string | null;
}): StripDay[] {
  const todayKey = toDateParam(todayIn(input.now, input.zone));
  return input.days.map((day) => {
    const key = toDateParam(day);
    const isToday = key === todayKey;
    return {
      key,
      label: isToday ? "Today" : format(day, "EEE"),
      date: format(day, "MMM d"),
      visits: input.appointments.filter(
        (appointment) => countsAsVisit(appointment) && dayKeyOfInstant(appointment.startsAt, input.zone) === key,
      ).length,
      isToday,
      selected: key === input.selectedKey,
    };
  });
}

/** "No visits", "1 visit", "3 visits". */
export function visitsWord(count: number): string {
  if (count <= 0) return "No visits";
  return count === 1 ? "1 visit" : `${count} visits`;
}

// ---------------------------------------------------------------------------
// One day, hour by hour
// ---------------------------------------------------------------------------

export type AgendaRow = {
  hour: number;
  /** "9 AM". */
  label: string;
  /** The `?at=` value that books this hour. */
  slot: string;
  /** Visits that start in this hour, earliest first. */
  items: CalendarAppointment[];
  /** Today, and this is the hour the clock is in. */
  isNow: boolean;
};

export type DayAgenda = {
  rows: AgendaRow[];
  /** The first visit still to come today (for the "Next" word). */
  nextId: string | null;
  /** Visits on the day that are not canceled. */
  visits: number;
  isToday: boolean;
  isPast: boolean;
};

/**
 * One row per hour of the shop's day, each with the visits that start in it.
 *
 *  - A day still to come shows every hour, so an empty hour is a place to book.
 *  - Today hides the empty hours that have already gone by (there is nothing to
 *    book into the past) but keeps every visit, and marks the hour it is now.
 *  - A day that is over shows only its visits.
 *
 * A visit booked outside the 8 AM - 8 PM window still gets its own hour row.
 */
export function dayAgenda(input: {
  day: Date;
  appointments: readonly CalendarAppointment[];
  now: Date;
  zone?: string;
}): DayAgenda {
  const key = toDateParam(input.day);
  const todayKey = toDateParam(todayIn(input.now, input.zone));
  const isToday = key === todayKey;
  const isPast = key < todayKey;
  const nowHour = wallHourMinute(input.now, input.zone).hour;

  const onDay = input.appointments
    .filter((appointment) => dayKeyOfInstant(appointment.startsAt, input.zone) === key)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const byHour = new Map<number, CalendarAppointment[]>();
  for (const appointment of onDay) {
    const hour = wallHourMinute(appointment.startsAt, input.zone).hour;
    byHour.set(hour, [...(byHour.get(hour) ?? []), appointment]);
  }

  const hours = new Set<number>();
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    if (isPast) continue;
    if (isToday && hour < nowHour) continue;
    hours.add(hour);
  }
  for (const hour of byHour.keys()) hours.add(hour);

  const rows = [...hours]
    .sort((a, b) => a - b)
    .map((hour) => ({
      hour,
      label: hourLabel(hour),
      slot: slotParam(input.day, hour),
      items: byHour.get(hour) ?? [],
      isNow: isToday && hour === nowHour,
    }));

  const next = isToday
    ? onDay.find((appointment) => asAppointmentStatus(appointment.status) === "SCHEDULED" && appointment.startsAt > input.now)
    : undefined;

  return {
    rows,
    nextId: next?.id ?? null,
    visits: onDay.filter(countsAsVisit).length,
    isToday,
    isPast,
  };
}

// ---------------------------------------------------------------------------
// The week, as day groups
// ---------------------------------------------------------------------------

export type DayGroup = { day: Date; key: string; items: CalendarAppointment[] };

/**
 * The week's days that have bookings, split at today: today and the days after
 * it come first (that is what the counter is planning), the days already gone
 * fold away under "Earlier this week". A week wholly in the past or the future
 * is all one list.
 */
export function weekGroups(input: {
  days: Date[];
  appointments: readonly CalendarAppointment[];
  now: Date;
  zone?: string;
}): { upcoming: DayGroup[]; earlier: DayGroup[] } {
  const todayKey = toDateParam(todayIn(input.now, input.zone));
  const groups = input.days
    .map((day) => {
      const key = toDateParam(day);
      return {
        day,
        key,
        items: input.appointments
          .filter((appointment) => dayKeyOfInstant(appointment.startsAt, input.zone) === key)
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      };
    })
    .filter((group) => group.items.length > 0);

  const weekHasToday = input.days.some((day) => toDateParam(day) === todayKey);
  if (!weekHasToday) return { upcoming: groups, earlier: [] };
  return {
    upcoming: groups.filter((group) => group.key >= todayKey),
    earlier: groups.filter((group) => group.key < todayKey),
  };
}
