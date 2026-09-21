import type { Metadata } from "next";
import Link from "next/link";
import { addDays, endOfDay, format, startOfDay } from "date-fns";

import { AppointmentList } from "@/components/appointments/appointment-list";
import {
  AutoAppointmentDialog,
  NewAppointmentButton,
} from "@/components/appointments/appointment-actions";
import type {
  AppointmentFormValues,
  AppointmentPickers,
} from "@/components/appointments/appointment-dialog";
import {
  DAY_START_HOUR,
  parseDateParam,
  parseLocalDateTime,
  slotParam,
  toDateParam,
  toTimeParam,
  weekDays,
  weekStart,
  type CalendarAppointment,
} from "@/components/appointments/calendar-meta";
import { TodayStrip } from "@/components/appointments/today-strip";
import { WeekGrid } from "@/components/appointments/week-grid";
import { Button } from "@/components/ui/button";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";

export const metadata: Metadata = { title: "Appointments · RepairPilot" };

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const NONE = "none";

/** The tech filter's "no filter" sentinel — stripped from every URL. */
const ALL_TECHS = "all";
const UNASSIGNED = "unassigned";

/** How much of the ticket / customer catalogue the pickers load up front. */
const PICKER_LIMIT = 500;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId, role } = await requireUser();
  const params = await searchParams;

  // One clock for the whole render — two components must never disagree about
  // where "now" is on the grid.
  const now = new Date();

  const view = one(params.view) === "day" ? "day" : "week";
  const anchor = parseDateParam(one(params.date) ?? one(params.week), now);
  const tech = one(params.tech) ?? ALL_TECHS;

  const days = view === "day" ? [anchor] : weekDays(weekStart(anchor));
  const rangeStart = startOfDay(days[0]);
  const rangeEnd = endOfDay(days[days.length - 1]);

  const editId = one(params.edit) ?? null;
  const at = parseLocalDateTime(one(params.at));

  const select = {
    id: true,
    title: true,
    notes: true,
    startsAt: true,
    endsAt: true,
    status: true,
    reminderSentAt: true,
    customer: {
      select: { id: true, firstName: true, lastName: true, businessName: true },
    },
    ticket: { select: { id: true, number: true, subject: true } },
    assignedTo: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
  } as const;

  // The calendar follows the top-bar branch: a second store's bookings are
  // somebody else's day.
  const branch = await locationWhere();
  // A booking made without a location belongs to no branch in particular, so
  // it shows under EVERY branch — hiding it (as a plain locationId match did)
  // made "no location" bookings vanish from the calendar they were made on.
  const branchOrUnassigned = branch.locationId
    ? { OR: [{ locationId: branch.locationId }, { locationId: null }] }
    : {};

  // "Whose day is this?" — the one lens a calendar actually needs. It narrows
  // the grid, the list AND the today strip together, so the three can never
  // disagree about how busy the shop is.
  const techWhere =
    tech === ALL_TECHS
      ? {}
      : { assignedToId: tech === UNASSIGNED ? null : tech };

  const [appointments, todayRows, customers, tickets, techs, locations, editing] =
    await Promise.all([
      db.appointment.findMany({
        where: {
          shopId,
          ...branchOrUnassigned,
          ...techWhere,
          startsAt: { gte: rangeStart, lte: rangeEnd },
        },
        orderBy: { startsAt: "asc" },
        select,
      }),
      // Today is reported no matter which week is on screen.
      db.appointment.findMany({
        where: {
          shopId,
          ...branchOrUnassigned,
          ...techWhere,
          startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
          status: { not: "CANCELED" },
        },
        orderBy: { startsAt: "asc" },
        select,
      }),
      db.customer.findMany({
        where: { shopId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: PICKER_LIMIT,
        select: { id: true, firstName: true, lastName: true, businessName: true },
      }),
      db.ticket.findMany({
        where: { shopId },
        orderBy: { createdAt: "desc" },
        take: PICKER_LIMIT,
        select: { id: true, number: true, subject: true, customerId: true },
      }),
      db.user.findMany({
        where: { shopId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.location.findMany({
        where: { shopId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      // Scoped by shopId like everything else — a guessed id 404s into "no
      // dialog" rather than opening another tenant's booking.
      editId
        ? db.appointment.findFirst({ where: { id: editId, shopId }, select })
        : Promise.resolve(null),
    ]);

  // ------------------------------------------------------------- pickers ---
  const ticketsByCustomer: Record<string, { value: string; label: string }[]> = {};
  for (const ticket of tickets) {
    (ticketsByCustomer[ticket.customerId] ??= []).push({
      value: ticket.id,
      label: `#${ticket.number} · ${ticket.subject}`,
    });
  }

  const pickers: AppointmentPickers = {
    customers: customers.map((customer) => ({
      value: customer.id,
      label:
        customer.businessName ||
        `${customer.firstName} ${customer.lastName}`.trim(),
    })),
    ticketsByCustomer,
    techs: techs.map((tech) => ({ value: tech.id, label: tech.name })),
    locations: locations.map((location) => ({
      value: location.id,
      label: location.name,
    })),
  };

  // --------------------------------------------------------------- links ---
  /**
   * Every /appointments URL is spelled here. The view, the anchor date and the
   * tech lens ride through every link — a technician filter that fell off when
   * you clicked "next week" would be worse than not having one.
   *
   * `date: null` means "drop the anchor", i.e. jump back to today.
   */
  const calendarHref = (patch: {
    view?: "week" | "day";
    date?: string | null;
    tech?: string;
    at?: string;
    edit?: string;
    new?: boolean;
  }) => {
    const next = new URLSearchParams();
    const nextView = patch.view ?? view;
    if (nextView === "day") next.set("view", "day");
    const nextDate = patch.date === undefined ? toDateParam(anchor) : patch.date;
    if (nextDate) next.set("date", nextDate);
    const nextTech = patch.tech ?? tech;
    if (nextTech !== ALL_TECHS) next.set("tech", nextTech);
    if (patch.at) next.set("at", patch.at);
    if (patch.edit) next.set("edit", patch.edit);
    if (patch.new) next.set("new", "1");
    const qs = next.toString();
    return qs ? `/appointments?${qs}` : "/appointments";
  };

  /** The calendar URL with no dialog on it — where closing a dialog returns to. */
  const closeHref = calendarHref({});

  const step = view === "day" ? 1 : 7;
  const prevHref = calendarHref({ date: toDateParam(addDays(anchor, -step)) });
  const nextHref = calendarHref({ date: toDateParam(addDays(anchor, step)) });

  const slotHref = (day: Date, hour: number) =>
    calendarHref({ at: slotParam(day, hour) });
  const editHref = (id: string) => calendarHref({ edit: id });

  const title =
    view === "day"
      ? format(anchor, "EEEE, MMMM d")
      : `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}`;

  // ------------------------------------------------------------- dialogs ---
  const defaults = defaultFormValues(now, branch.locationId ?? null);
  const dialogValues: AppointmentFormValues | null = editing
    ? valuesFromAppointment(editing)
    : at
      ? { ...defaults, startDate: toDateParam(at), startTime: toTimeParam(at) }
      : one(params.new) === "1"
        ? defaults
        : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Appointments"
        description="Drop-offs, pickups, callbacks and on-site jobs — who's booked in and when."
        actions={<NewAppointmentButton pickers={pickers} defaults={defaults} />}
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Calendar views"
          tabs={[
            {
              label: "Week",
              href: calendarHref({ view: "week" }),
              active: view === "week",
            },
            {
              label: "Day",
              href: calendarHref({ view: "day" }),
              active: view === "day",
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="icon" asChild>
            <Link href={prevHref} scroll={false} aria-label="Previous">
              <ACTIONS.back />
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={nextHref} scroll={false} aria-label="Next">
              <ACTIONS.next />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={calendarHref({ date: null })} scroll={false}>
              Today
            </Link>
          </Button>
          <span className="ml-1.5 flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <ICONS.appointment className="size-4 text-muted-foreground" />
            {title}
          </span>
        </div>

        {techs.length > 0 ? (
          <FilterChips
            label="Tech"
            options={[
              {
                label: "All",
                href: calendarHref({ tech: ALL_TECHS }),
                active: tech === ALL_TECHS,
              },
              {
                label: "Unassigned",
                href: calendarHref({ tech: UNASSIGNED }),
                active: tech === UNASSIGNED,
              },
              ...techs.map((t) => ({
                label: t.name,
                href: calendarHref({ tech: t.id }),
                active: tech === t.id,
              })),
            ]}
          />
        ) : null}
      </div>

      <TodayStrip
        count={todayRows.length}
        next={nextUp(todayRows, now)}
        now={now}
        editHref={editHref}
      />

      {/* The grid needs horizontal room; on a phone the list below IS the view. */}
      <div className="hidden md:block">
        <WeekGrid
          days={days}
          appointments={appointments}
          slotHref={slotHref}
          editHref={editHref}
          now={now}
        />
      </div>

      <AppointmentList
        days={days}
        appointments={appointments}
        editHref={editHref}
        canDelete={role === "OWNER"}
        now={now}
        filtered={tech !== ALL_TECHS}
      />

      {dialogValues ? (
        <AutoAppointmentDialog
          // Keyed so clicking a different slot/block rebuilds the form rather
          // than leaving the previous one's values in the inputs.
          key={editing?.id ?? one(params.at)}
          pickers={pickers}
          values={dialogValues}
          closeHref={closeHref}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** The soonest appointment today that hasn't finished yet. */
function nextUp(
  todayRows: CalendarAppointment[],
  now: Date,
): CalendarAppointment | null {
  return todayRows.find((appointment) => appointment.endsAt > now) ?? null;
}

/** A blank booking: the next round hour, one hour long. */
function defaultFormValues(now: Date, locationId: string | null): AppointmentFormValues {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(Math.max(DAY_START_HOUR, start.getHours() + 1));

  return {
    id: null,
    title: "",
    customerId: "",
    ticketId: NONE,
    assignedToId: NONE,
    // New bookings land in the branch on screen, where they will be looked for.
    locationId: locationId ?? NONE,
    startDate: toDateParam(start),
    startTime: toTimeParam(start),
    duration: "60",
    endTime: toTimeParam(new Date(start.getTime() + 60 * 60_000)),
    notes: "",
    reminderSentLabel: null,
  };
}

function valuesFromAppointment(
  appointment: CalendarAppointment,
): AppointmentFormValues {
  const minutes = Math.round(
    (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
  );
  // Snap back onto a preset when the length is one of them, so re-saving an
  // untouched appointment doesn't quietly turn into a "custom" booking.
  const preset = [30, 60, 90, 120].includes(minutes) ? String(minutes) : "custom";

  return {
    id: appointment.id,
    title: appointment.title,
    customerId: appointment.customer?.id ?? "",
    ticketId: appointment.ticket?.id ?? NONE,
    assignedToId: appointment.assignedTo?.id ?? NONE,
    locationId: appointment.location?.id ?? NONE,
    startDate: toDateParam(appointment.startsAt),
    startTime: toTimeParam(appointment.startsAt),
    duration: preset,
    endTime: toTimeParam(appointment.endsAt),
    notes: appointment.notes ?? "",
    reminderSentLabel: appointment.reminderSentAt
      ? format(appointment.reminderSentAt, "MMM d, h:mm a")
      : null,
  };
}
