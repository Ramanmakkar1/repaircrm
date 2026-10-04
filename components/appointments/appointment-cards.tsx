import Link from "next/link";
import { isSameDay } from "date-fns";
import { Clock, User, Wrench, MapPin } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { MetaChip, RecordGrid } from "@/components/ui/record-card";
import { AppointmentRowActions } from "./appointment-actions";
import { AppointmentCardLink } from "./card-link";
import {
  APPOINTMENT_STATUS_META,
  asAppointmentStatus,
  type CalendarAppointment,
} from "./calendar-meta";
import {
  appointmentCardParts,
  dayHeading,
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
 */
export function AppointmentCards({
  days,
  appointments,
  editHref,
  newHref,
  canDelete,
  now,
  filtered = false,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  editHref: (id: string) => string;
  /** The calendar URL that opens the empty "book a visit" dialog. */
  newHref: string;
  canDelete: boolean;
  now: Date;
  /** A tech filter is on, so "nothing booked" needs a different explanation. */
  filtered?: boolean;
}) {
  const populated = days
    .map((day) => ({
      day,
      items: appointments.filter((appointment) =>
        isSameDay(appointment.startsAt, day),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (populated.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
            className="py-8"
          icon={ICONS.appointment}
          title={filtered ? "Nothing booked for this tech" : "Nothing booked"}
          hint={
            filtered
              ? "Switch the tech filter back to All to see everyone."
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

  return (
    <div className="flex flex-col gap-6">
      {populated.map(({ day, items }) => {
        const heading = dayHeading(day, now);
        return (
          <section key={day.toISOString()} aria-label={heading.main} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight">
                <span className={cn(heading.today && "text-accent-soft-foreground")}>
                  {heading.main}
                </span>
                <span className="text-base font-normal text-muted-foreground">
                  {heading.sub}
                </span>
              </h2>
              <span className="rf-num rounded-full bg-surface-hover px-2.5 py-1 text-sm font-semibold text-muted-foreground">
                {items.length} booked
              </span>
            </div>

            <RecordGrid>
              {items.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  editHref={editHref(appointment.id)}
                  canDelete={canDelete}
                />
              ))}
            </RecordGrid>
          </section>
        );
      })}
    </div>
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

function AppointmentCard({
  appointment,
  editHref,
  canDelete,
}: {
  appointment: CalendarAppointment;
  editHref: string;
  canDelete: boolean;
}) {
  const parts = appointmentCardParts(appointment);
  const status = asAppointmentStatus(appointment.status);
  const meta = APPOINTMENT_STATUS_META[status];

  const statusPill = (
    <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
  );

  return (
    <li className="flex flex-col gap-2">
      <AppointmentCardLink
        href={editHref}
        className={cn(parts.canceled && "text-muted-foreground")}
        visual={
          <TimeVisual
            hour={parts.hour}
            period={parts.period}
            struck={parts.canceled}
          />
        }
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
