import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EntryDialog } from "@/app/(app)/time-clock/entry-dialog";
import { formatHours } from "@/app/(app)/time-clock/meta";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { InitialsVisual } from "@/components/ui/record-card";
import { shiftRange, shiftSeconds } from "./shift-meta";

/**
 * The Easy-mode shifts: simple cards in place of the dense tables. Same rows,
 * same hours, same owner corrections (the edit and delete buttons are the same
 * `EntryDialog`); only the dressing changes.
 */

type Shift = {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  note: string | null;
};

/** Your own shifts for today: one card each, hours on the right. */
export function TodayShifts({
  entries,
  now,
  weekLabel,
}: {
  entries: Shift[];
  now: Date;
  /** "12h 30m logged this week" - the line under the heading. */
  weekLabel: string;
}) {
  return (
    <section aria-label="Today" className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Today</h2>
        <p className="text-sm text-muted-foreground">{weekLabel}</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            className="py-8"
            icon={ICONS.timeClock}
            title="Nothing logged today"
            hint="Press Clock in above when you start your shift and it will show up here."
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-lg font-semibold leading-tight">
                  {shiftRange(entry.clockInAt, entry.clockOutAt)}
                </span>
                {entry.note ? (
                  <span className="truncate text-sm text-muted-foreground">
                    {entry.note}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="rf-num text-xl font-semibold">
                  {formatHours(shiftSeconds(entry, now))}
                </span>
                {entry.clockOutAt ? null : (
                  <StatusPill tone="active" label="Running" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type TeamRow = {
  name: string;
  seconds: number;
  entries: (Shift & { id: string; user: { name: string } })[];
};

/** The owner's week: one card per person, their shifts underneath, corrections one tap away. */
export function TeamWeek({
  rows,
  now,
  start,
  end,
  totalSeconds,
  isThisWeek,
  prevHref,
  thisWeekHref,
  nextHref,
  exportHref,
}: {
  rows: TeamRow[];
  now: Date;
  start: Date;
  end: Date;
  totalSeconds: number;
  isThisWeek: boolean;
  prevHref: string;
  thisWeekHref: string;
  nextHref: string;
  exportHref: string;
}) {
  return (
    <section aria-label="The team" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            The team · {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatHours(totalSeconds)} across{" "}
            {rows.length === 1 ? "1 person" : `${rows.length} people`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" className="h-12 px-4 text-base" asChild>
            <Link href={prevHref}>
              <ChevronLeft />
              Previous week
            </Link>
          </Button>
          {isThisWeek ? null : (
            <Button variant="outline" size="lg" className="h-12 px-4 text-base" asChild>
              <Link href={thisWeekHref}>This week</Link>
            </Button>
          )}
          <Button variant="outline" size="lg" className="h-12 px-4 text-base" asChild>
            <Link href={nextHref}>
              Next week
              <ChevronRight />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="h-12 px-4 text-base" asChild>
            <a href={exportHref}>
              <ACTIONS.download />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            className="py-8"
            icon={ICONS.timeClock}
            title="Nobody clocked in this week"
            hint="Shifts appear here as soon as somebody presses Clock in."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li
              key={row.name}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <div className="flex items-center gap-3 p-4">
                <InitialsVisual
                  name={row.name}
                  className="size-12 text-lg sm:size-12 sm:text-lg"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-lg font-semibold leading-tight">
                    {row.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {row.entries.length === 1 ? "1 shift" : `${row.entries.length} shifts`}
                  </span>
                </div>
                <span className="rf-num shrink-0 text-xl font-semibold">
                  {formatHours(row.seconds)}
                </span>
              </div>

              <ul className="divide-y divide-border border-t border-border">
                {row.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                        {format(entry.clockInAt, "EEE MMM d")}
                        {entry.clockOutAt ? null : (
                          <StatusPill tone="active" label="Running" />
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {shiftRange(entry.clockInAt, entry.clockOutAt)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rf-num pr-1 text-lg font-semibold">
                        {formatHours(shiftSeconds(entry, now))}
                      </span>
                      <EntryDialog
                        entryId={entry.id}
                        userName={entry.user.name}
                        clockInValue={format(entry.clockInAt, "yyyy-MM-dd'T'HH:mm")}
                        clockOutValue={
                          entry.clockOutAt
                            ? format(entry.clockOutAt, "yyyy-MM-dd'T'HH:mm")
                            : ""
                        }
                        note={entry.note ?? ""}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
