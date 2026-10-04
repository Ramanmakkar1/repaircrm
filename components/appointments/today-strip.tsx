import Link from "next/link";
import { format } from "date-fns";
import { CalendarCheck, Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { IconVisual } from "@/components/ui/record-card";
import { dayKeyIn, longDayLabel } from "@/lib/dashboard/zone";
import {
  customerNameOf,
  shortTime,
  timeRange,
  type CalendarAppointment,
} from "./calendar-meta";

/**
 * The "what is happening today" line above the calendar.
 *
 * It answers the two questions someone opening this page at 9am actually has —
 * how many today, and what's next — without making them find today's column
 * first. It reports on TODAY regardless of which week is on screen, so browsing
 * ahead never hides the fact that a customer is due in twenty minutes.
 */
export function TodayStrip({
  count,
  next,
  now,
  editHref,
  simple = false,
  zone,
  todayHref,
}: {
  count: number;
  next: CalendarAppointment | null;
  now: Date;
  editHref: (id: string) => string;
  /** Easy mode: bigger type, bigger tap target, "visits" not "appointments". */
  simple?: boolean;
  /** The shop's time zone: what "today" and the times are read in. */
  zone?: string;
  /** Easy mode: opens today in the Day view (the strip is shown while browsing another week). */
  todayHref?: string;
}) {
  const customerName = next ? customerNameOf(next.customer) : null;
  const started = next ? next.startsAt <= now : false;
  const dateLabel = zone ? longDayLabel(dayKeyIn(now.getTime(), zone)) : format(now, "EEEE, MMMM d");

  if (simple) {
    return (
      <section
        aria-label="Today"
        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <IconVisual icon={CalendarCheck} className="size-14 sm:size-14" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-semibold leading-tight text-foreground">
              {count === 0
                ? "Nothing booked today"
                : `${count} ${count === 1 ? "visit" : "visits"} today`}
            </span>
            <span className="text-sm text-muted-foreground">
              {dateLabel}
              {todayHref ? (
                <>
                  {" · "}
                  <Link href={todayHref} scroll={false} className="font-semibold text-accent-soft-foreground hover:underline">
                    Open today
                  </Link>
                </>
              ) : null}
            </span>
          </div>
        </div>

        {next ? (
          <Link
            href={editHref(next.id)}
            scroll={false}
            className={cn(
              "flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-hover px-4 py-2 transition-colors",
              "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md",
            )}
          >
            <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-muted-foreground">
                {started ? "Happening now" : `Next · ${shortTime(next.startsAt, zone)}`}
              </span>
              <span className="truncate text-base font-semibold text-foreground">
                {customerName ?? next.title}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {customerName ? `${next.title} · ` : ""}
                {timeRange(next.startsAt, next.endsAt, zone)}
                {next.assignedTo ? ` · ${next.assignedTo.name}` : ""}
              </span>
            </span>
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <IconChip icon={CalendarCheck} size="sm" />
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold leading-tight text-foreground">
            {count === 0
              ? "Nothing booked today"
              : `${count} appointment${count === 1 ? "" : "s"} today`}
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            {dateLabel}
          </span>
        </div>
      </div>

      {next ? (
        <Link
          href={editHref(next.id)}
          scroll={false}
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border bg-surface-hover/60 px-3 py-2 transition-colors",
            "hover:border-accent/40 hover:bg-accent-soft/50",
          )}
        >
          <Clock className="size-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[11.5px] font-semibold tracking-[0.02em] text-muted-foreground">
              {started ? "In progress" : `Next · ${shortTime(next.startsAt, zone)}`}
            </span>
            <span className="truncate text-[13.5px] font-semibold text-foreground">
              {next.title}
              {customerName ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {customerName}
                </span>
              ) : null}
            </span>
            <span className="rf-num text-[12px] text-faint-foreground">
              {timeRange(next.startsAt, next.endsAt, zone)}
              {next.assignedTo ? ` · ${next.assignedTo.name}` : ""}
            </span>
          </div>
        </Link>
      ) : null}
    </Card>
  );
}
