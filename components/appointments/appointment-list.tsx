import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { CalendarClock, MapPin, StickyNote, UserRound, Wrench } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { AppointmentRowActions } from "./appointment-actions";
import {
  APPOINTMENT_STATUS_META,
  asAppointmentStatus,
  customerNameOf,
  durationLabel,
  timeRange,
  type CalendarAppointment,
} from "./calendar-meta";

/**
 * The same week as a plain list.
 *
 * Not a fallback that duplicates the grid — the grid is for reading the shape
 * of the week, and this is for *doing* things: it is where the cross-links to
 * the customer and the ticket live, and where Done / Cancel / Delete sit. On a
 * phone, where the grid hides, it becomes the whole calendar.
 */
export function AppointmentList({
  days,
  appointments,
  editHref,
  canDelete,
  now,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  editHref: (id: string) => string;
  canDelete: boolean;
  now: Date;
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
      <Card>
        <EmptyState
          icon={CalendarClock}
          title="Nothing booked"
          hint="Click any empty slot on the calendar to book something into it."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {populated.map(({ day, items }) => (
        <Card key={day.toISOString()}>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle
              className={cn(isSameDay(day, now) && "text-accent-soft-foreground")}
            >
              {format(day, "EEEE, MMMM d")}
            </CardTitle>
            <span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-[12.5px] font-semibold leading-none tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </CardHeader>

          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  editHref={editHref}
                  canDelete={canDelete}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AppointmentRow({
  appointment,
  editHref,
  canDelete,
}: {
  appointment: CalendarAppointment;
  editHref: (id: string) => string;
  canDelete: boolean;
}) {
  const status = asAppointmentStatus(appointment.status);
  const meta = APPOINTMENT_STATUS_META[status];
  const customerName = customerNameOf(appointment.customer);
  const canceled = status === "CANCELED";

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-4">
        {/* The time is the column the eye scans down, so it gets its own gutter. */}
        <div className="flex w-24 shrink-0 flex-col gap-0.5 pt-0.5">
          <span
            className={cn(
              "text-[13.5px] font-bold tabular-nums text-foreground",
              canceled && "text-faint-foreground line-through",
            )}
          >
            {timeRange(appointment.startsAt, appointment.endsAt)}
          </span>
          <span className="text-[12.5px] tabular-nums text-faint-foreground">
            {durationLabel(appointment.startsAt, appointment.endsAt)}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={editHref(appointment.id)}
              scroll={false}
              className={cn(
                "truncate text-[15px] font-bold text-foreground hover:text-accent hover:underline",
                canceled && "text-muted-foreground line-through",
              )}
            >
              {appointment.title}
            </Link>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none",
                meta.bg,
                meta.fg,
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {appointment.customer && customerName ? (
              <Link href={`/customers/${appointment.customer.id}`}>
                <Chip
                  icon={UserRound}
                  className="transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground"
                >
                  {customerName}
                </Chip>
              </Link>
            ) : null}

            {appointment.ticket ? (
              <Link href={`/tickets/${appointment.ticket.id}`}>
                <Chip
                  icon={Wrench}
                  className="transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground"
                >
                  #{appointment.ticket.number}
                </Chip>
              </Link>
            ) : null}

            <Chip icon={UserRound}>
              {appointment.assignedTo?.name ?? "Unassigned"}
            </Chip>

            {appointment.location ? (
              <Chip icon={MapPin}>{appointment.location.name}</Chip>
            ) : null}
          </div>

          {appointment.notes ? (
            <p className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-faint-foreground" />
              <span className="line-clamp-2">{appointment.notes}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 sm:pl-4">
        <AppointmentRowActions
          appointmentId={appointment.id}
          status={status}
          canDelete={canDelete}
        />
      </div>
    </li>
  );
}
