import Link from "next/link";
import { format } from "date-fns";
import { CalendarCheck, Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
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
}: {
  count: number;
  next: CalendarAppointment | null;
  now: Date;
  editHref: (id: string) => string;
}) {
  const customerName = next ? customerNameOf(next.customer) : null;
  const started = next ? next.startsAt <= now : false;

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
            {format(now, "EEEE, MMMM d")}
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
              {started ? "In progress" : `Next · ${shortTime(next.startsAt)}`}
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
              {timeRange(next.startsAt, next.endsAt)}
              {next.assignedTo ? ` · ${next.assignedTo.name}` : ""}
            </span>
          </div>
        </Link>
      ) : null}
    </Card>
  );
}
