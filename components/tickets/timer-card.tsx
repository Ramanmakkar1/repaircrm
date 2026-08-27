"use client";

import * as React from "react";
import { Play, Square, Timer, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
} from "@/app/(app)/tickets/actions";
import { formatClock, formatDuration } from "./ticket-meta";

export type TimeEntryRow = {
  id: string;
  userName: string;
  startedAtISO: string;
  startedAtLabel: string;
  seconds: number | null;
  running: boolean;
  note: string | null;
};

/**
 * Built-in time tracking. One running timer per user per ticket, enforced
 * server-side — the button state here is convenience, not the guarantee.
 */
export function TimerCard({
  ticketId,
  entries,
  completedSeconds,
  myRunningEntry,
}: {
  ticketId: string;
  entries: TimeEntryRow[];
  completedSeconds: number;
  myRunningEntry: TimeEntryRow | null;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <Timer className="size-4 text-muted-foreground" />
          Time
        </CardTitle>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {formatDuration(completedSeconds)} logged
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {myRunningEntry ? (
          <form
            action={stopTimerAction.bind(null, ticketId)}
            className="flex flex-wrap items-center gap-2 rounded-md bg-status-in-progress-bg px-3 py-2"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-status-in-progress-fg">
              <span className="size-1.5 animate-pulse rounded-full bg-status-in-progress" />
              <LiveDuration startedAtISO={myRunningEntry.startedAtISO} />
            </span>
            <Input
              name="note"
              placeholder="What are you working on?"
              className="h-9 min-w-[10rem] flex-1 bg-surface"
              aria-label="Note for this time entry"
            />
            <Button type="submit" size="sm" variant="outline">
              <Square className="size-3.5" />
              Stop
            </Button>
          </form>
        ) : (
          <form action={startTimerAction.bind(null, ticketId)}>
            <Button type="submit" size="sm" variant="outline" className="w-full">
              <Play className="size-4" />
              Start timer
            </Button>
          </form>
        )}

        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No time logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-2 py-1.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-foreground">
                    {entry.userName}
                    <span className="ml-1.5 text-xs text-faint-foreground">
                      {entry.startedAtLabel}
                    </span>
                  </p>
                  {entry.note ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      "tabular-nums",
                      entry.running
                        ? "font-medium text-status-in-progress-fg"
                        : "text-muted-foreground",
                    )}
                  >
                    {entry.running ? (
                      <LiveDuration startedAtISO={entry.startedAtISO} />
                    ) : (
                      formatDuration(entry.seconds ?? 0)
                    )}
                  </span>
                  <form action={deleteTimeEntryAction.bind(null, entry.id)}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete time entry"
                      className="size-6 text-faint-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ticks a running timer once a second.
 *
 * Renders a dashed placeholder until mounted: computing elapsed time from
 * `Date.now()` during render would differ between the server HTML and the first
 * client paint, which React reports as a hydration mismatch.
 */
function LiveDuration({ startedAtISO }: { startedAtISO: string }) {
  const [seconds, setSeconds] = React.useState<number | null>(null);

  React.useEffect(() => {
    const startedAt = new Date(startedAtISO).getTime();
    const tick = () =>
      setSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAtISO]);

  return (
    <span className="tabular-nums">
      {seconds === null ? "--:--:--" : formatClock(seconds)}
    </span>
  );
}
