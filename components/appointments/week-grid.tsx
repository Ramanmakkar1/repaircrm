import Link from "next/link";
import { format } from "date-fns";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  APPOINTMENT_STATUS_META,
  EASY_HOUR_PX,
  EASY_MIN_BLOCK_PX,
  HOUR_PX,
  HOUR_SLOTS,
  VISIBLE_HOURS,
  asAppointmentStatus,
  customerNameOf,
  hourLabel,
  initialsOf,
  isOnDay,
  layoutDay,
  nowOffsetPx,
  shortTime,
  toDateParam,
  todayIn,
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
 *
 * Where a booking sits is read on the SHOP'S wall clock (`zone`). `easy` draws
 * the touch version: 96px hours, so no block is under 48px, bigger words, and
 * "Today" written over today's column.
 */
export function WeekGrid({
  days,
  appointments,
  slotHref,
  editHref,
  now,
  zone,
  easy = false,
}: {
  days: Date[];
  appointments: CalendarAppointment[];
  slotHref: (day: Date, hour: number) => string;
  editHref: (id: string) => string;
  now: Date;
  zone?: string;
  easy?: boolean;
}) {
  const columns = `${easy ? 72 : 60}px repeat(${days.length}, minmax(0, 1fr))`;
  const hourPx = easy ? EASY_HOUR_PX : HOUR_PX;
  const gridHeight = VISIBLE_HOURS * hourPx;
  const todayKey = toDateParam(todayIn(now, zone));

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
              const today = toDateParam(day) === todayKey;
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "flex flex-col items-center gap-0.5 border-l border-border px-2 py-3",
                    today && "bg-accent-soft/40",
                  )}
                >
                  <span
                    className={cn(
                      "font-semibold uppercase tracking-wide",
                      easy ? "text-sm" : "text-[11.5px]",
                      today ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {today && easy ? "Today" : format(day, "EEE")}
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
            <div className="relative" style={{ height: gridHeight }}>
              {HOUR_SLOTS.map((hour) => (
                <div
                  key={hour}
                  className="relative"
                  style={{ height: hourPx }}
                >
                  <span
                    className={cn(
                      "absolute -top-2 right-2 font-medium tabular-nums",
                      easy ? "text-sm text-muted-foreground" : "text-[11.5px] text-faint-foreground",
                    )}
                  >
                    {hourLabel(hour)}
                  </span>
                </div>
              ))}
            </div>

            {days.map((day) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                appointments={appointments.filter((appointment) =>
                  isOnDay(appointment.startsAt, day, zone),
                )}
                slotHref={slotHref}
                editHref={editHref}
                now={now}
                zone={zone}
                today={toDateParam(day) === todayKey}
                easy={easy}
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
  zone,
  today,
  easy,
}: {
  day: Date;
  appointments: CalendarAppointment[];
  slotHref: (day: Date, hour: number) => string;
  editHref: (id: string) => string;
  now: Date;
  zone?: string;
  today: boolean;
  easy: boolean;
}) {
  const hourPx = easy ? EASY_HOUR_PX : HOUR_PX;
  const placed = layoutDay(day, appointments, {
    zone,
    hourPx,
    minBlockPx: easy ? EASY_MIN_BLOCK_PX : undefined,
  });
  const nowOffset = today ? nowOffsetPx(now, zone, hourPx) : null;

  return (
    <div
      className={cn("relative border-l border-border", today && "bg-accent-soft/15")}
      style={{ height: VISIBLE_HOURS * hourPx }}
    >
      {/* Empty hours are the click target for "book something here". */}
      {HOUR_SLOTS.map((hour) => (
        <Link
          key={hour}
          href={slotHref(day, hour)}
          scroll={false}
          aria-label={`Book ${format(day, "EEEE d MMMM")} at ${hourLabel(hour)}`}
          className="block border-t border-border transition-colors hover:bg-accent-soft/50"
          style={{ height: hourPx }}
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
        const roomy = heightPx >= (easy ? 72 : 52);

        return (
          <Link
            key={item.id}
            href={editHref(item.id)}
            scroll={false}
            className={cn(
              "absolute z-10 flex flex-col gap-0.5 overflow-hidden rounded-md border px-2 py-1 leading-tight shadow-xs transition-colors",
              easy ? "text-sm" : "text-[11.5px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              meta.block,
            )}
            style={{
              top: topPx,
              height: heightPx,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
            title={`${shortTime(item.startsAt, zone)} · ${item.title}${
              customerName ? ` · ${customerName}` : ""
            }`}
          >
            <span className="flex items-baseline justify-between gap-1">
              <span className="truncate font-bold">{easy ? (customerName ?? item.title) : item.title}</span>
              {initials ? (
                <span className="shrink-0 rounded-sm bg-surface/70 px-1 text-[10px] font-bold tabular-nums">
                  {initials}
                </span>
              ) : null}
            </span>
            {roomy ? (
              <>
                <span className="truncate tabular-nums opacity-80">
                  {shortTime(item.startsAt, zone)}
                </span>
                {easy ? (
                  // A visit still to come is the normal case; Done and Canceled say so in words.
                  status !== "SCHEDULED" ? (
                    <span className="truncate font-semibold">{meta.label}</span>
                  ) : customerName ? (
                    <span className="truncate opacity-80">{item.title}</span>
                  ) : null
                ) : customerName ? (
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
