import Link from "next/link";
import { Plus } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { AppointmentCard } from "./appointment-cards";
import type { DayAgenda as DayAgendaData } from "./agenda";
import { visitMoment } from "./card-meta";
import { shortTime } from "./calendar-meta";

/**
 * Easy mode's Day view: the shop's day hour by hour, as big rows.
 *
 *   9 AM   [ (DB) Daniel Brooks ........ Next  Scheduled ]
 *          [ Mark done ] [ More ]
 *   10 AM  [ + Free. Tap to book 10 AM ]
 *
 * An empty hour is the place to book (a link to `?at=`, the same as tapping the
 * calendar grid); a visit is the same card as everywhere else with the
 * customer's initials, because the hour is already on the left. The hour the
 * clock is in says "Now" in words.
 */
export function DayAgenda({
  agenda,
  now,
  zone,
  slotHref,
  editHref,
  canDelete,
  dayLabel,
}: {
  agenda: DayAgendaData;
  now: Date;
  zone?: string;
  slotHref: (slot: string) => string;
  editHref: (id: string) => string;
  canDelete: boolean;
  /** "Sunday, October 4": the section's name. */
  dayLabel: string;
}) {
  if (agenda.rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-base text-muted-foreground">
        Nothing was booked on {dayLabel}.
      </p>
    );
  }

  return (
    <section aria-label={`Visits on ${dayLabel}`}>
      <ol className="flex flex-col">
        {agenda.rows.map((row) => (
          <li
            key={row.hour}
            className={cn(
              "grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 border-t border-border py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-4",
              row.isNow && "border-t-2 border-accent",
            )}
          >
            <div className="flex flex-col pt-1">
              <span className="rf-num text-lg font-semibold leading-tight">{row.label}</span>
              {row.isNow ? (
                <>
                  <span className="mt-1 w-fit rounded-md bg-accent px-2 py-0.5 text-[13px] font-semibold text-accent-foreground">
                    Now
                  </span>
                  <span className="rf-num mt-0.5 whitespace-nowrap text-[13px] text-muted-foreground">{shortTime(now, zone)}</span>
                </>
              ) : null}
            </div>

            {row.items.length > 0 ? (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {row.items.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    editHref={editHref(appointment.id)}
                    canDelete={canDelete}
                    zone={zone}
                    visual="person"
                    moment={agenda.isToday ? visitMoment(appointment, now, agenda.nextId) : null}
                  />
                ))}
              </ul>
            ) : (
              <Link
                href={slotHref(row.slot)}
                scroll={false}
                data-touch-control
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 text-base text-muted-foreground transition-colors",
                  "hover:border-ring hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Plus className="size-5 shrink-0" aria-hidden />
                <span>
                  Free<span className="sr-only">. Book a visit at {row.label}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
