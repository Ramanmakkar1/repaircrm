import type { Metadata } from "next";
import { addDays, format } from "date-fns";

import { dayAgenda, stripDays } from "@/components/appointments/agenda";
import { AppointmentCards } from "@/components/appointments/appointment-cards";
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
  dayKeyOfInstant,
  defaultBookingSlot,
  isOnDay,
  parseDateParam,
  parseLocalDateTime,
  rangeOfDays,
  slotParam,
  toDateParam,
  toTimeParam,
  todayIn,
  wallTimeOf,
  weekDays,
  weekStart,
  type CalendarAppointment,
} from "@/components/appointments/calendar-meta";
import { CalendarNav } from "@/components/appointments/calendar-nav";
import { DayAgenda } from "@/components/appointments/day-agenda";
import { DayStrip } from "@/components/appointments/day-strip";
import { StaffChips } from "@/components/appointments/staff-chips";
import { TodayStrip } from "@/components/appointments/today-strip";
import { WeekGrid } from "@/components/appointments/week-grid";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { formatIn } from "@/lib/dashboard/zone";
import { locationWhere } from "@/lib/location";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Visits · Repairs helper" };

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const NONE = "none";

/** The staff filter's "no filter" sentinel — stripped from every URL. */
const ALL_TECHS = "all";
const UNASSIGNED = "unassigned";

/** How much of the ticket / customer catalogue the pickers load up front. */
const PICKER_LIMIT = 500;

type View = "day" | "week" | "calendar";

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Visits (the Appointments calendar).
 *
 * Easy mode, the counter tablet: a row of view tabs (Day, Week, Calendar) with
 * Previous / Today / Next beside them, the week as seven day chips that say how
 * many visits each holds, and a Staff row. The Day view is the shop's day hour
 * by hour (an empty hour is a place to book); the Week view is the days with
 * visits as cards, opening on today; the Calendar view is the hour grid drawn
 * for fingers. Full mode keeps the grid over the dense day tables.
 *
 * Every day boundary and every time on this page is read on the SHOP'S clock
 * (`Shop.timezone`), never the server's.
 *
 * `?book=1&customerId=<id>` (the customer page's "Book a visit") opens the
 * booking with that customer already chosen; an id that is not this shop's is
 * an ordinary empty booking.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId, role } = await requireUser();
  const [params, { simple }, zone] = await Promise.all([searchParams, readUiPrefs(), loadShopZone(shopId)]);

  // One clock for the whole render — two components must never disagree about
  // where "now" is on the grid.
  const now = new Date();
  const today = todayIn(now, zone);

  const rawView = one(params.view);
  // The touch Calendar is Easy mode's own view; Full mode always draws the grid with its week.
  const view: View = rawView === "day" ? "day" : rawView === "calendar" && simple ? "calendar" : "week";
  const anchor = parseDateParam(one(params.date) ?? one(params.week), today);
  const tech = one(params.tech) ?? ALL_TECHS;

  const week = weekDays(weekStart(anchor));
  const days = view === "day" ? [anchor] : week;
  // Easy mode's day strip counts the whole week even in the Day view.
  const loaded = simple ? week : days;
  const range = rangeOfDays(loaded[0], loaded[loaded.length - 1], zone);
  const todayRange = rangeOfDays(today, today, zone);

  const editId = one(params.edit) ?? null;
  const at = parseLocalDateTime(one(params.at));
  const booking = one(params.book) === "1" || one(params.new) === "1";
  const bookFor = booking ? (one(params.customerId) ?? null) : null;

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

  const customerSelect = {
    id: true,
    firstName: true,
    lastName: true,
    businessName: true,
    phone: true,
    mobile: true,
    email: true,
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

  const [appointments, todayRows, customers, tickets, techs, locations, editing, bookCustomer, bookTickets] =
    await Promise.all([
      db.appointment.findMany({
        where: {
          shopId,
          ...branchOrUnassigned,
          ...techWhere,
          startsAt: { gte: range.from, lt: range.toExclusive },
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
          startsAt: { gte: todayRange.from, lt: todayRange.toExclusive },
          status: { not: "CANCELED" },
        },
        orderBy: { startsAt: "asc" },
        select,
      }),
      db.customer.findMany({
        where: { shopId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: PICKER_LIMIT,
        select: customerSelect,
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
      // The customer a "Book a visit" link came with: this shop's, or nobody.
      bookFor
        ? db.customer.findFirst({ where: { id: bookFor, shopId }, select: customerSelect })
        : Promise.resolve(null),
      bookFor
        ? db.ticket.findMany({
            where: { shopId, customerId: bookFor },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, number: true, subject: true, customerId: true },
          })
        : Promise.resolve([]),
    ]);

  // ------------------------------------------------------------- pickers ---
  const ticketsByCustomer: Record<string, { value: string; label: string }[]> = {};
  const seenTickets = new Set<string>();
  for (const ticket of [...tickets, ...bookTickets]) {
    if (seenTickets.has(ticket.id)) continue;
    seenTickets.add(ticket.id);
    (ticketsByCustomer[ticket.customerId] ??= []).push({
      value: ticket.id,
      label: `#${ticket.number} · ${ticket.subject}`,
    });
  }

  // The booked-for customer leads the list even when they are not among the
  // first 500, so the dialog can name them.
  const pickerCustomers =
    bookCustomer && !customers.some((customer) => customer.id === bookCustomer.id)
      ? [bookCustomer, ...customers]
      : customers;

  const pickers: AppointmentPickers = {
    customers: pickerCustomers.map((customer) => ({
      value: customer.id,
      label:
        customer.businessName ||
        `${customer.firstName} ${customer.lastName}`.trim(),
      // A returning customer is found by the number they give at the counter.
      phone: customer.mobile || customer.phone,
      email: customer.email,
    })),
    ticketsByCustomer,
    techs: techs.map((tech) => ({ value: tech.id, label: tech.name })),
    locations: locations.map((location) => ({
      value: location.id,
      label: location.name,
    })),
    moreCustomers: customers.length >= PICKER_LIMIT,
    timeZone: zone,
  };

  // --------------------------------------------------------------- links ---
  /**
   * Every /appointments URL is spelled here. The view, the anchor date and the
   * staff lens ride through every link — a filter that fell off when you
   * clicked "next week" would be worse than not having one.
   *
   * `date: null` means "drop the anchor", i.e. jump back to today.
   */
  const calendarHref = (patch: {
    view?: View;
    date?: string | null;
    tech?: string;
    at?: string;
    edit?: string;
    new?: boolean;
  }) => {
    const next = new URLSearchParams();
    const nextView = patch.view ?? view;
    if (nextView !== "week") next.set("view", nextView);
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
  const dayHref = (key: string) => calendarHref({ view: "day", date: key });

  const todayKey = toDateParam(today);
  const anchorIsToday = toDateParam(anchor) === todayKey;
  const title =
    view === "day"
      ? `${format(anchor, "EEEE, MMMM d")}${anchorIsToday ? " · Today" : ""}`
      : `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}`;
  const weekHasToday = week.some((day) => toDateParam(day) === todayKey);

  // ------------------------------------------------------------- dialogs ---
  const defaults = defaultFormValues(now, zone, branch.locationId ?? null);
  const dialogValues: AppointmentFormValues | null = editing
    ? valuesFromAppointment(editing, zone)
    : at
      ? { ...defaults, startDate: toDateParam(at), startTime: toTimeParam(at) }
      : booking
        ? { ...defaults, customerId: bookCustomer?.id ?? "" }
        : null;

  const staffChips = [
    { key: ALL_TECHS, label: simple ? "Everyone" : "All", href: calendarHref({ tech: ALL_TECHS }), active: tech === ALL_TECHS },
    { key: UNASSIGNED, label: simple ? "Not assigned" : "Unassigned", href: calendarHref({ tech: UNASSIGNED }), active: tech === UNASSIGNED },
    ...techs.map((t) => ({ key: t.id, label: t.name, href: calendarHref({ tech: t.id }), active: tech === t.id })),
  ];

  const dialog = dialogValues ? (
    <AutoAppointmentDialog
      // Keyed so clicking a different slot/block rebuilds the form rather
      // than leaving the previous one's values in the inputs.
      key={editing?.id ?? one(params.at) ?? `book:${bookCustomer?.id ?? ""}`}
      pickers={pickers}
      values={dialogValues}
      closeHref={closeHref}
      simple={simple}
    />
  ) : null;

  const header = (
    <PageHeader
      title={simple ? "Visits" : "Appointments"}
      description={
        simple
          ? "Who is coming in, and when."
          : "Drop-offs, pickups, callbacks and on-site jobs — who's booked in and when."
      }
      actions={
        <NewAppointmentButton
          pickers={pickers}
          defaults={defaults}
          simple={simple}
        />
      }
    />
  );

  // ---------------------------------------------------------- Full mode ---
  if (!simple) {
    const calendarGrid = (
      <WeekGrid
        days={days}
        appointments={appointments}
        slotHref={slotHref}
        editHref={editHref}
        now={now}
        zone={zone}
      />
    );
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="flex flex-col gap-3">
          <FilterTabs
            aria-label="Calendar views"
            tabs={[
              { label: "Day", href: calendarHref({ view: "day" }), active: view === "day" },
              { label: "Week", href: calendarHref({ view: "week" }), active: view !== "day" },
            ]}
          />
          <CalendarNav
            title={title}
            prevHref={prevHref}
            todayHref={calendarHref({ date: null })}
            nextHref={nextHref}
            simple={false}
          />
          {techs.length > 0 ? (
            // One scrolling row, never a second line, so a phone keeps the cards in view.
            <div className="overflow-x-auto pb-1">
              <FilterChips
                className="w-max flex-nowrap"
                label="Staff"
                options={staffChips.map(({ label, href, active }) => ({ label, href, active }))}
              />
            </div>
          ) : null}
        </div>

        <TodayStrip
          count={todayRows.length}
          next={nextUp(todayRows, now)}
          now={now}
          editHref={editHref}
          zone={zone}
        />

        {/* The grid needs horizontal room; on a phone the list below IS the view. */}
        <div className="hidden md:block">{calendarGrid}</div>

        <AppointmentList
          days={days}
          appointments={appointments}
          editHref={editHref}
          canDelete={role === "OWNER"}
          now={now}
          filtered={tech !== ALL_TECHS}
          zone={zone}
        />
        {dialog}
      </div>
    );
  }

  // ---------------------------------------------------------- Easy mode ---
  const shown = view === "day" ? appointments.filter((item) => isOnDay(item.startsAt, anchor, zone)) : appointments;
  const strip = stripDays({ days: week, appointments, now, zone, selectedKey: view === "day" ? toDateParam(anchor) : null });

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="flex flex-col gap-3">
        {/* One row on the counter tablet: the views, what is on screen, and the arrows. */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterTabs
            aria-label="Calendar views"
            className="pb-0"
            tabs={[
              { label: "Day", href: calendarHref({ view: "day" }), active: view === "day" },
              { label: "Week", href: calendarHref({ view: "week" }), active: view === "week" },
              { label: "Calendar", href: calendarHref({ view: "calendar" }), active: view === "calendar" },
            ]}
          />
          <h2 className="order-last w-full text-xl font-semibold tracking-tight lg:order-none lg:w-auto lg:flex-1 lg:text-center">
            {title}
          </h2>
          <div className="w-full sm:ml-auto sm:w-auto">
            <CalendarNav
              title={title}
              prevHref={prevHref}
              todayHref={calendarHref({ date: null })}
              nextHref={nextHref}
              simple
              hideTitle
            />
          </div>
        </div>

        <DayStrip days={strip} dayHref={dayHref} />
        <StaffChips chips={staffChips} />
      </div>

      {/* Browsing another week: today's visits are still one line away. */}
      {!weekHasToday ? (
        <TodayStrip
          count={todayRows.length}
          next={nextUp(todayRows, now)}
          now={now}
          editHref={editHref}
          zone={zone}
          todayHref={calendarHref({ view: "day", date: null })}
          simple
        />
      ) : null}

      {view === "day" ? (
        <DayAgenda
          agenda={dayAgenda({ day: anchor, appointments: shown, now, zone })}
          now={now}
          zone={zone}
          slotHref={(slot) => calendarHref({ at: slot })}
          editHref={editHref}
          canDelete={role === "OWNER"}
          dayLabel={format(anchor, "EEEE, MMMM d")}
        />
      ) : view === "calendar" ? (
        <section aria-label="Calendar" className="flex flex-col gap-2">
          <p className="text-[15px] text-muted-foreground">Tap an empty hour to book a visit into it. Tap a visit to open it.</p>
          <WeekGrid
            days={days}
            appointments={appointments}
            slotHref={slotHref}
            editHref={editHref}
            now={now}
            zone={zone}
            easy
          />
        </section>
      ) : (
        <AppointmentCards
          days={days}
          appointments={appointments}
          editHref={editHref}
          newHref={calendarHref({ new: true })}
          canDelete={role === "OWNER"}
          now={now}
          filtered={tech !== ALL_TECHS}
          zone={zone}
          foldPast
          dayHref={dayHref}
        />
      )}

      {dialog}
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

/** A blank booking: the next round hour on the shop's clock, inside the calendar's day, one hour long. */
function defaultFormValues(now: Date, zone: string, locationId: string | null): AppointmentFormValues {
  const slot = defaultBookingSlot(now, zone);

  return {
    id: null,
    title: "",
    customerId: "",
    ticketId: NONE,
    assignedToId: NONE,
    // New bookings land in the branch on screen, where they will be looked for.
    locationId: locationId ?? NONE,
    startDate: slot.date,
    startTime: slot.time,
    duration: "60",
    endTime: slot.endTime,
    notes: "",
    reminderSentLabel: null,
  };
}

function valuesFromAppointment(
  appointment: CalendarAppointment,
  zone: string,
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
    // The shop's wall clock: what the booking was made as, whatever zone the server is in.
    startDate: dayKeyOfInstant(appointment.startsAt, zone),
    startTime: wallTimeOf(appointment.startsAt, zone),
    duration: preset,
    endTime: wallTimeOf(appointment.endsAt, zone),
    notes: appointment.notes ?? "",
    reminderSentLabel: appointment.reminderSentAt
      ? formatIn(appointment.reminderSentAt.getTime(), zone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null,
  };
}
