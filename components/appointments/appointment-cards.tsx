import Link from "next/link";
import { CalendarCheck, Clock, User, Wrench, MapPin } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { IconVisual, InitialsVisual, MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { AppointmentRowActions } from "./appointment-actions";
import { weekGroups, type DayGroup } from "./agenda";
import {
  APPOINTMENT_STATUS_META,
  asAppointmentStatus,
  customerNameOf,
  type CalendarAppointment,
} from "./calendar-meta";
import {
  appointmentCardParts,
  dayHeading,
  visitMoment,
  type CardFact,
} from "./card-meta";

const FACT_ICON: Record<CardFact["key"], typeof Clock> = {
  range: Clock,
  tech: User,
  ticket: Wrench,
  location: MapPin,
};

/**
 * The Easy-mode list: each day that has bookings, as a heading and a grid of
 * big cards, in place of the dense table in `appointment-list.tsx`. Same data,
 * same row actions (Mark done / Cancel / Reopen / Delete), same links.
 *
 *   [ 9:00 ]  Okonkwo Dental ..................... [ Scheduled ]
 *   [  AM  ]  On-site visit
 *             (9 AM - 10 AM) (Dana Ortiz) (Repair #1042)
 *   [ Mark done ] [ More ]
 *
 * With `foldPast`, a week that holds today opens on today: the days already gone
 * fold away under "Earlier this week" at the bottom, so on a Saturday nobody
 * scrolls past five days of finished visits to reach tomorrow.
 */
export function AppointmentCards({
  days,
  appointments,
  editHref,
  newHref,
  canDelete,
  now,
  filtered = false,
  zone,
  foldPast = false,
  dayHref,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  editHref: (id: string) => string;
  /** The calendar URL that opens the empty "book a visit" dialog. */
  newHref: string;
  canDelete: boolean;
  now: Date;
  /** A staff filter is on, so "nothing booked" needs a different explanation. */
  filtered?: boolean;
  /** The shop's time zone: what "today" and every time on a card is read in. */
  zone?: string;
  /** Fold the days before today away under "Earlier this week". */
  foldPast?: boolean;
  /** Opens one day in the Day view (the day headings become links). */
  dayHref?: (key: string) => string;
}) {
  const groups = weekGroups({ days, appointments, now, zone });
  const upcoming = foldPast ? groups.upcoming : [...groups.earlier, ...groups.upcoming];
  const earlier = foldPast ? groups.earlier : [];

  if (upcoming.length === 0 && earlier.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          className="py-8"
          icon={ICONS.appointment}
          title={filtered ? "Nothing booked for this person" : "Nothing booked"}
          hint={
            filtered
              ? "Switch Staff back to All to see everyone."
              : "Book a visit and it will show up here."
          }
          action={
            filtered ? undefined : (
              <Button variant="outline" asChild>
                <Link href={newHref} scroll={false}>
                  Book a visit
                </Link>
              </Button>
            )
          }
        />
      </div>
    );
  }

  const section = (group: DayGroup) => (
    <DaySection
      key={group.key}
      group={group}
      now={now}
      zone={zone}
      editHref={editHref}
      canDelete={canDelete}
      dayHref={dayHref}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-5 text-base text-muted-foreground">
          Nothing more booked this week.
        </p>
      ) : (
        upcoming.map(section)
      )}

      {earlier.length > 0 ? (
        <details className="group/earlier rounded-2xl border border-border bg-surface">
          <summary
            data-touch-control
            className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
          >
            <span>
              Earlier this week
              <span className="ml-2 font-normal text-muted-foreground">
                {earlier.reduce((sum, group) => sum + group.items.length, 0)} booked
              </span>
            </span>
            <span className="text-[15px] text-accent-soft-foreground">
              <span className="group-open/earlier:hidden">Show</span>
              <span className="hidden group-open/earlier:inline">Hide</span>
            </span>
          </summary>
          <div className="flex flex-col gap-6 border-t border-border p-4">{earlier.map(section)}</div>
        </details>
      ) : null}
    </div>
  );
}

function DaySection({
  group,
  now,
  zone,
  editHref,
  canDelete,
  dayHref,
}: {
  group: DayGroup;
  now: Date;
  zone?: string;
  editHref: (id: string) => string;
  canDelete: boolean;
  dayHref?: (key: string) => string;
}) {
  const heading = dayHeading(group.day, now, zone);
  const nextId = heading.today
    ? (group.items.find(
        (item) => asAppointmentStatus(item.status) === "SCHEDULED" && item.startsAt > now,
      )?.id ?? null)
    : null;
  const title = (
    <>
      <span className={cn(heading.today && "text-accent-soft-foreground")}>{heading.main}</span>
      <span className="text-base font-normal text-muted-foreground">{heading.sub}</span>
    </>
  );

  return (
    <section aria-label={heading.main === "Today" ? `Today, ${heading.sub}` : `${heading.main} ${heading.sub}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight">
          {dayHref ? (
            <Link href={dayHref(group.key)} className="flex flex-wrap items-baseline gap-x-2 hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <span className="rf-num rounded-full bg-surface-hover px-2.5 py-1 text-sm font-semibold text-muted-foreground">
          {group.items.length} booked
        </span>
      </div>

      <RecordGrid>
        {group.items.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            editHref={editHref(appointment.id)}
            canDelete={canDelete}
            zone={zone}
            moment={heading.today ? visitMoment(appointment, now, nextId) : null}
          />
        ))}
      </RecordGrid>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** The start time, big, in the picture slot of the card. */
function TimeVisual({
  hour,
  period,
  struck,
}: {
  hour: string;
  period: string;
  struck: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-20 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-hover text-foreground sm:size-24",
        struck && "text-faint-foreground",
      )}
    >
      <span
        className={cn(
          "rf-num text-2xl font-semibold leading-none tracking-tight",
          struck && "line-through",
        )}
      >
        {hour}
      </span>
      <span className="mt-1 text-sm font-semibold uppercase text-muted-foreground">
        {period}
      </span>
    </span>
  );
}

/**
 * One visit: the whole card opens it, Mark done (or Reopen) and More sit under
 * it. `visual` picks the picture: the start time (a list of days, where the
 * time is the thing to scan) or the customer's initials (the Day view, where
 * the hour is already on the left). A done or canceled visit is drawn quieter
 * than one still to come; its status word still says which.
 */
export function AppointmentCard({
  appointment,
  editHref,
  canDelete,
  zone,
  visual = "time",
  moment = null,
}: {
  appointment: CalendarAppointment;
  editHref: string;
  canDelete: boolean;
  zone?: string;
  visual?: "time" | "person";
  /** "Happening now" / "Next", beside the status. */
  moment?: "Happening now" | "Next" | null;
}) {
  const parts = appointmentCardParts(appointment, zone);
  const status = asAppointmentStatus(appointment.status);
  const meta = APPOINTMENT_STATUS_META[status];
  const customer = customerNameOf(appointment.customer);

  const statusPill = (
    <span className="flex flex-wrap items-center gap-1.5">
      {moment ? <StatusPill tone={moment === "Next" ? "info" : "active"} label={moment} /> : null}
      <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
    </span>
  );

  const picture =
    visual === "person" ? (
      customer ? (
        <InitialsVisual
          name={customer}
          className={cn("size-16 text-xl sm:size-16 sm:text-xl", parts.settled && "bg-surface-hover text-muted-foreground")}
        />
      ) : (
        <IconVisual icon={CalendarCheck} className="size-16 sm:size-16" />
      )
    ) : (
      <TimeVisual hour={parts.hour} period={parts.period} struck={parts.canceled} />
    );

  return (
    <li className="flex flex-col gap-2">
      <RecordCard
        href={editHref}
        // The card opens the edit dialog over this page: keep the list where it is.
        scroll={false}
        className={cn(parts.settled && "bg-surface-hover/40 text-muted-foreground")}
        visual={picture}
        title={parts.title}
        subtitle={parts.subtitle}
        // Top right from the tablet up; on a phone it moves into the row of
        // facts so the customer's name keeps the width.
        status={<span className="hidden sm:block">{statusPill}</span>}
        meta={
          <>
            <span className="sm:hidden">{statusPill}</span>
            {parts.facts.map((fact) => (
              <MetaChip key={fact.key} icon={FACT_ICON[fact.key]}>
                {fact.text}
              </MetaChip>
            ))}
          </>
        }
      />
      <AppointmentRowActions
        layout="buttons"
        appointmentId={appointment.id}
        editHref={editHref}
        status={appointment.status}
        canDelete={canDelete}
      />
    </li>
  );
}
