import Link from "next/link";
import { format, isSameDay } from "date-fns";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  APPOINTMENT_STATUS_META,
  DAY_START_HOUR,
  GRID_HEIGHT_PX,
  HOUR_PX,
  HOUR_SLOTS,
  VISIBLE_HOURS,
  asAppointmentStatus,
  customerNameOf,
  initialsOf,
  layoutDay,
  shortTime,
  type CalendarAppointment,
} from "./calendar-meta";

/**
 * The calendar itself — rendered entirely on the SERVER.
 *
 * There is no calendar runtime here: a day column is a `position: relative` box
 * exactly `VISIBLE_HOURS * HOUR_PX` tall, and every appointment is one
 * absolutely-positioned block whose `top` and `height` come from arithmetic on
 * its own timestamps (see layoutDay). That buys three things a client-side grid
 * would not: the whole week is in the first HTML response, overlapping bookings
 * are laid into side-by-side lanes before anything paints, and the only
 * JavaScript on the page is the dialog.
 *
 * Interaction is links, for the same reason: an empty hour links to
 * `?at=<slot>` and a block links to `?edit=<id>`, so both are deep-linkable,
 * survive a refresh, and work with the back button.
 */
export function WeekGrid({
  days,
  appointments,
  slotHref,
  editHref,
  now,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  slotHref: (day: Date, hour: number) => string;
  editHref: (id: string) => string;
  now: Date;
}) {
  const columns = `60px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <Card className="overflow-hidden">
      {/* Seven columns need room; below that the list underneath is the view. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: days.length > 1 ? 720 : 360 }}>
          {/* ------------------------------------------------ day headings -- */}
          <div
            className="grid border-b border-border bg-surface"
            style={{ gridTemplateColumns: columns }}
          >
            <div />
            {days.map((day) => {
              const today = isSameDay(day, now);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "flex flex-col items-center gap-0.5 border-l border-border px-2 py-3",
                    today && "bg-accent-soft/40",
                  )}
                >
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-[15px] font-bold tabular-nums",
                      today
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* -------------------------------------------------- hour grid -- */}
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            {/* Time gutter. Labels sit ON the hour line, nudged up half a line. */}
            <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
              {HOUR_SLOTS.map((hour) => (
                <div
                  key={hour}
                  className="relative"
                  style={{ height: HOUR_PX }}
                >
                  <span className="absolute -top-2 right-2 text-[11.5px] font-medium tabular-nums text-faint-foreground">
                    {formatHour(hour)}
                  </span>
                </div>
              ))}
            </div>

            {days.map((day) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                appointments={appointments.filter((appointment) =>
                  isSameDay(appointment.startsAt, day),
                )}
                slotHref={slotHref}
                editHref={editHref}
                now={now}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DayColumn({
  day,
  appointments,
  slotHref,
  editHref,
  now,
}: {
  day: Date;
  appointments: CalendarAppointment[];
  slotHref: (day: Date, hour: number) => string;
  editHref: (id: string) => string;
  now: Date;
}) {
  const placed = layoutDay(day, appointments);
  const today = isSameDay(day, now);
  const nowOffset = today ? nowOffsetPx(now) : null;

  return (
    <div
      className={cn("relative border-l border-border", today && "bg-accent-soft/15")}
      style={{ height: GRID_HEIGHT_PX }}
    >
      {/* Empty hours are the click target for "book something here". */}
      {HOUR_SLOTS.map((hour) => (
        <Link
          key={hour}
          href={slotHref(day, hour)}
          scroll={false}
          aria-label={`Book ${format(day, "EEEE d MMMM")} at ${formatHour(hour)}`}
          className="block border-t border-border transition-colors hover:bg-accent-soft/50"
          style={{ height: HOUR_PX }}
        />
      ))}

      {nowOffset !== null ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-status-overdue"
          style={{ top: nowOffset }}
        >
          <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-status-overdue" />
        </div>
      ) : null}

      {placed.map(({ item, topPx, heightPx, lane, lanes }) => {
        const status = asAppointmentStatus(item.status);
        const meta = APPOINTMENT_STATUS_META[status];
        const customerName = customerNameOf(item.customer);
        const initials = initialsOf(item.assignedTo?.name);
        const roomy = heightPx >= 52;

        return (
          <Link
            key={item.id}
            href={editHref(item.id)}
            scroll={false}
            className={cn(
              "absolute z-10 flex flex-col gap-0.5 overflow-hidden rounded-md border px-2 py-1 text-[11.5px] leading-tight shadow-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              meta.block,
            )}
            style={{
              top: topPx,
              height: heightPx,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
            title={`${shortTime(item.startsAt)} · ${item.title}${
              customerName ? ` · ${customerName}` : ""
            }`}
          >
            <span className="flex items-baseline justify-between gap-1">
              <span className="truncate font-bold">{item.title}</span>
              {initials ? (
                <span className="shrink-0 rounded-sm bg-surface/70 px-1 text-[10px] font-bold tabular-nums">
                  {initials}
                </span>
              ) : null}
            </span>
            {roomy ? (
              <>
                <span className="truncate tabular-nums opacity-80">
                  {shortTime(item.startsAt)}
                </span>
                {customerName ? (
                  <span className="truncate opacity-80">{customerName}</span>
                ) : null}
              </>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** "8 AM", "12 PM", "5 PM" — no minutes, they're always :00. */
function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** Where the "now" line sits, or null when the clock is outside the window. */
function nowOffsetPx(now: Date): number | null {
  const minutes = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
  if (minutes < 0 || minutes > VISIBLE_HOURS * 60) return null;
  return (minutes / 60) * HOUR_PX;
}
