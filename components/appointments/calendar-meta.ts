/**
 * Calendar geometry and vocabulary.
 *
 * Pure by contract — no `db`, no `next/*`, no "use server" — because the week
 * grid is rendered on the SERVER and the new-appointment dialog runs on the
 * client, and both need the same idea of where 2:30pm sits.
 *
 * TIME ZONES: everything here works in the server's local time zone, which is
 * also the browser's during development. `Shop.timezone` exists in the schema
 * but honouring it properly needs a TZ-aware date library, and none is
 * installed — so a shop in another zone would see its grid shifted. Called out
 * rather than half-solved.
 */

import { addDays, format, startOfDay, startOfWeek } from "date-fns";

import type { StatusTone } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// The visible window
// ---------------------------------------------------------------------------

/** Rows run 8:00 → 20:00 — a repair shop's day, not a 24-hour astronomy chart. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
export const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;

/** One hour of wall-clock time, in pixels. The grid's only magic number. */
export const HOUR_PX = 64;
export const GRID_HEIGHT_PX = VISIBLE_HOURS * HOUR_PX;

/** Even a 15-minute job needs to be readable and clickable. */
const MIN_BLOCK_PX = 26;

export const HOUR_SLOTS: number[] = Array.from(
  { length: VISIBLE_HOURS },
  (_, index) => DAY_START_HOUR + index,
);

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUSES = ["SCHEDULED", "DONE", "CANCELED"] as const;
export type AppointmentStatusKey = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Where each booking state sits in the app-wide tone language (see
 * `components/ui/badge.tsx`), plus the one thing a tone cannot express: how the
 * BLOCK on the week grid is painted. A pill is 20px of chrome next to a word;
 * a block is a coloured rectangle the eye reads from across the room, so it
 * carries its own border/wash/hover rather than borrowing the chip classes.
 */
export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatusKey,
  { label: string; tone: StatusTone; struck?: boolean; block: string }
> = {
  SCHEDULED: {
    label: "Scheduled",
    tone: "info",
    // The only loud blocks on the grid — the ones that still have to happen.
    block:
      "border-accent/40 bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft/80",
  },
  DONE: {
    label: "Done",
    tone: "success",
    block:
      "border-status-resolved/30 bg-status-resolved-bg/70 text-status-resolved-fg",
  },
  CANCELED: {
    label: "Canceled",
    tone: "neutral",
    struck: true,
    block:
      "border-border bg-surface-hover text-faint-foreground line-through decoration-1",
  },
};

export function asAppointmentStatus(value: unknown): AppointmentStatusKey {
  return APPOINTMENT_STATUSES.includes(value as AppointmentStatusKey)
    ? (value as AppointmentStatusKey)
    : "SCHEDULED";
}

// ---------------------------------------------------------------------------
// Week / day navigation
// ---------------------------------------------------------------------------

/** Monday of the week containing `date`. */
export function weekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** The seven days, Monday first. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** `yyyy-MM-dd`, the form every date param and `<input type="date">` uses. */
export function toDateParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** `HH:mm`, for `<input type="time">`. */
export function toTimeParam(date: Date): string {
  return format(date, "HH:mm");
}

/**
 * Parses a `yyyy-MM-dd` param as LOCAL midnight.
 *
 * `new Date("2026-08-24")` is specified to parse a bare date as *UTC* midnight,
 * which renders as the 23rd for anyone west of UTC — so a week the user clicked
 * into would silently come back one day early. Splitting the parts pins it to
 * the shop's own calendar day. (Same rule as the ticket due-date parser.)
 */
export function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return startOfDay(fallback);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) {
    const loose = new Date(value);
    return Number.isNaN(loose.getTime()) ? startOfDay(fallback) : startOfDay(loose);
  }
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

/**
 * Parses a `yyyy-MM-ddTHH:mm` (or `yyyy-MM-dd HH:mm`) value as local wall time.
 * Used by the click-a-slot `?at=` param and by the form's date + time pair.
 */
export function parseLocalDateTime(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());
  if (!parts) return null;
  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    Number(parts[4]),
    Number(parts[5]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The `?at=` value for a given day + hour, e.g. "2026-08-27T14:00". */
export function slotParam(day: Date, hour: number): string {
  return `${toDateParam(day)}T${String(hour).padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "9:00 AM" — but "9 AM" when it lands on the hour, which most slots do. */
export function shortTime(date: Date): string {
  return format(date, date.getMinutes() === 0 ? "h a" : "h:mm a");
}

export function timeRange(startsAt: Date, endsAt: Date): string {
  return `${shortTime(startsAt)} – ${shortTime(endsAt)}`;
}

export function durationLabel(startsAt: Date, endsAt: Date): string {
  const minutes = Math.max(
    0,
    Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Up to two uppercase initials for the tech badge on a block. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Durations offered by the form
// ---------------------------------------------------------------------------

export const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1 hour 30" },
  { value: "120", label: "2 hours" },
  { value: "custom", label: "Custom end time" },
] as const;

// ---------------------------------------------------------------------------
// The row shape every calendar view renders
// ---------------------------------------------------------------------------

/**
 * One appointment, already joined to the four things a block or a list row has
 * to show. Shared so the grid and the list can never drift apart on what they
 * select.
 */
export type CalendarAppointment = {
  id: string;
  title: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    businessName: string | null;
  } | null;
  ticket: { id: string; number: number; subject: string } | null;
  assignedTo: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  /** Stamped by lib/jobs/appointments.ts once the reminder has gone out. */
  reminderSentAt?: Date | null;
};

export function customerNameOf(
  customer: CalendarAppointment["customer"],
): string | null {
  if (!customer) return null;
  return (
    customer.businessName ||
    `${customer.firstName} ${customer.lastName}`.trim() ||
    null
  );
}

// ---------------------------------------------------------------------------
// Block geometry
// ---------------------------------------------------------------------------

export type Interval = { startsAt: Date; endsAt: Date };

/** Minutes from the top of the visible window, clamped into it. */
function offsetMinutes(day: Date, moment: Date): number {
  const dayStart = new Date(day);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const minutes = (moment.getTime() - dayStart.getTime()) / 60_000;
  return Math.max(0, Math.min(VISIBLE_HOURS * 60, minutes));
}

export type Positioned<T> = {
  item: T;
  topPx: number;
  heightPx: number;
  /** 0-based column within the overlap cluster. */
  lane: number;
  /** How many columns that cluster needs. */
  lanes: number;
};

/**
 * Places one day's appointments, splitting overlapping ones into side-by-side
 * lanes so a double-booking is *visible* rather than hidden underneath.
 *
 * Appointments are clustered by actual overlap (not by hour), then each is
 * dropped into the first lane whose previous booking has already ended — the
 * standard greedy interval-colouring, and it never needs more lanes than the
 * deepest simultaneous overlap.
 */
export function layoutDay<T extends Interval>(day: Date, items: T[]): Positioned<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      a.endsAt.getTime() - b.endsAt.getTime(),
  );

  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const entry of cluster) out.push({ ...entry, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    const start = item.startsAt.getTime();
    const end = item.endsAt.getTime();

    // A gap with nothing running closes the cluster: what follows can't
    // overlap anything before it, so it starts its lanes over at zero.
    if (start >= clusterEnd) flushCluster();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    clusterEnd = Math.max(clusterEnd, end);

    const top = (offsetMinutes(day, item.startsAt) / 60) * HOUR_PX;
    const bottom = (offsetMinutes(day, item.endsAt) / 60) * HOUR_PX;

    cluster.push({
      item,
      topPx: top,
      heightPx: Math.max(MIN_BLOCK_PX, bottom - top),
      lane,
      lanes: 1,
    });
  }
  flushCluster();

  return out;
}
