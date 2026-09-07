import Link from "next/link";
import { format, isSameDay } from "date-fns";

import { StatusPill } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
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
 * The same week as a dense day-by-day table.
 *
 * Not a fallback that duplicates the grid — the grid is for reading the SHAPE
 * of the week, and this is the ledger: it is where the cross-links to the
 * customer and the ticket live, and where Done / Cancel / Delete sit behind the
 * row's `⋯`. On a phone, where the grid hides, it becomes the whole calendar.
 *
 * One table per day rather than one table with a day column: the date is the
 * heading you scan for, and repeating it down a column would be seven copies
 * of the same word.
 */
export function AppointmentList({
  days,
  appointments,
  editHref,
  canDelete,
  now,
  filtered = false,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  editHref: (id: string) => string;
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
      <Card>
        <EmptyState
          icon={ICONS.appointment}
          title={filtered ? "Nothing booked for this tech" : "Nothing booked"}
          hint={
            filtered
              ? "Switch the tech filter back to All to see the rest of the week."
              : "Click any empty slot on the calendar to book something into it."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {populated.map(({ day, items }) => (
        <Card key={day.toISOString()} className="overflow-hidden">
          <CardHeader
            title={
              <span
                className={cn(isSameDay(day, now) && "text-accent-soft-foreground")}
              >
                {format(day, "EEEE, MMMM d")}
              </span>
            }
            action={
              <span className="rf-num text-[12.5px] font-medium text-muted-foreground">
                {items.length} booked
              </span>
            }
          />

          <Table>
            <THead>
              <Tr>
                <Th>Time</Th>
                <Th>Appointment</Th>
                <Th>Customer</Th>
                <Th>Ticket</Th>
                <Th>Assigned</Th>
                <Th>Location</Th>
                <Th>Status</Th>
                <Th className="w-10">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  editHref={editHref}
                  canDelete={canDelete}
                />
              ))}
            </TBody>
          </Table>
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
    // `group` is what lets the row's ⋯ appear on hover.
    <Tr className="group">
      <Td>
        <span className="flex flex-col gap-0.5">
          <span
            className={cn(
              "rf-num font-semibold text-foreground",
              canceled && "text-faint-foreground line-through",
            )}
          >
            {timeRange(appointment.startsAt, appointment.endsAt)}
          </span>
          <span className="rf-num text-[11.5px] text-faint-foreground">
            {durationLabel(appointment.startsAt, appointment.endsAt)}
          </span>
        </span>
      </Td>

      <Td>
        <span className="flex items-center gap-1.5">
          <Link
            href={editHref(appointment.id)}
            scroll={false}
            title={appointment.notes ?? appointment.title}
            className={cn(
              "block max-w-[240px] truncate rounded-sm font-semibold text-foreground hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              canceled && "text-muted-foreground line-through",
            )}
          >
            {appointment.title}
          </Link>
          {appointment.notes ? (
            <ICONS.note
              aria-label="Has notes"
              className="size-3.5 shrink-0 text-faint-foreground"
            />
          ) : null}
        </span>
      </Td>

      <Td>
        {appointment.customer && customerName ? (
          <Link
            href={`/customers/${appointment.customer.id}`}
            className="block max-w-[160px] truncate text-muted-foreground hover:text-foreground hover:underline"
          >
            {customerName}
          </Link>
        ) : (
          <span className="text-faint-foreground">—</span>
        )}
      </Td>

      <Td>
        {appointment.ticket ? (
          <Link
            href={`/tickets/${appointment.ticket.id}`}
            className="rf-id font-semibold text-accent-soft-foreground hover:underline"
          >
            #{appointment.ticket.number}
          </Link>
        ) : (
          <span className="text-faint-foreground">—</span>
        )}
      </Td>

      <Td
        className={
          appointment.assignedTo ? "text-muted-foreground" : "text-faint-foreground"
        }
      >
        <span className="block max-w-[130px] truncate">
          {appointment.assignedTo?.name ?? "Unassigned"}
        </span>
      </Td>

      <Td
        className={
          appointment.location ? "text-muted-foreground" : "text-faint-foreground"
        }
      >
        <span className="block max-w-[130px] truncate">
          {appointment.location?.name ?? "—"}
        </span>
      </Td>

      <Td>
        <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
      </Td>

      <Td className="text-right">
        <AppointmentRowActions
          appointmentId={appointment.id}
          editHref={editHref(appointment.id)}
          status={status}
          canDelete={canDelete}
        />
      </Td>
    </Tr>
  );
}
