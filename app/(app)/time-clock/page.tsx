import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClockCard } from "./clock-card";
import { EntryDialog } from "./entry-dialog";
import {
  addDays,
  endOfDay,
  formatHours,
  parseDateParam,
  secondsBetween,
  startOfDay,
  toDateParam,
  weekEnd,
  weekStart,
} from "./meta";

export const metadata = { title: "Time clock · RepairFlow" };

/**
 * One row of the owner's view. Named rather than inferred because the query is
 * behind a role ternary, and `typeof` on that widens to include `never[]`.
 */
type TeamEntry = {
  id: string;
  userId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  note: string | null;
  user: { name: string };
};

// Reads a live clock; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

/**
 * The time clock.
 *
 * TWO AUDIENCES, ONE PAGE
 * -----------------------
 *   Everyone   one big button, today's shifts, this week's total.
 *   The owner   the whole team's week, with prev/next, corrections and a
 *               payroll export.
 *
 * The owner's half is not rendered-and-hidden for a technician — the query
 * never runs. A shop floor is a public place, and a colleague's hours are not
 * a technician's business.
 */
export default async function TimeClockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId, userId, role } = await requireUser();
  const params = await searchParams;
  const isOwner = role === "OWNER";

  // One request-time clock, so every duration on the page is measured against
  // the same instant rather than each row reaching for its own.
  const now = new Date();

  const anchor = parseDateParam(one(params.week), now);
  const start = weekStart(anchor);
  const end = weekEnd(start);

  const [mine, team] = await Promise.all([
    // My own week, always — a technician needs their own hours even though they
    // cannot see anyone else's.
    db.timeClockEntry.findMany({
      where: { shopId, userId, clockInAt: { gte: start, lte: end } },
      orderBy: { clockInAt: "desc" },
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        note: true,
      },
    }),
    isOwner
      ? db.timeClockEntry.findMany({
          where: { shopId, clockInAt: { gte: start, lte: end } },
          orderBy: [{ clockInAt: "desc" }],
          select: {
            id: true,
            userId: true,
            clockInAt: true,
            clockOutAt: true,
            note: true,
            user: { select: { name: true } },
          },
        })
      : Promise.resolve([] as TeamEntry[]),
  ]);

  const openEntry = mine.find((entry) => entry.clockOutAt === null) ?? null;

  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todaySeconds = mine
    .filter(
      (entry) => entry.clockInAt >= dayStart && entry.clockInAt <= dayEnd,
    )
    // A running entry counts up to the render's clock; the ticker in ClockCard
    // continues from there rather than restating it.
    .reduce(
      (sum, entry) =>
        sum + (entry.clockOutAt ? secondsBetween(entry.clockInAt, entry.clockOutAt) : 0),
      0,
    );

  const weekSeconds = mine.reduce(
    (sum, entry) =>
      sum +
      secondsBetween(entry.clockInAt, entry.clockOutAt ?? now),
    0,
  );

  const todayEntries = mine.filter(
    (entry) => entry.clockInAt >= dayStart && entry.clockInAt <= dayEnd,
  );

  // The owner's week, grouped by person, newest shift first within each.
  const byUser = new Map<
    string,
    { name: string; seconds: number; entries: TeamEntry[] }
  >();
  for (const entry of team) {
    const bucket = byUser.get(entry.userId) ?? {
      name: entry.user.name,
      seconds: 0,
      entries: [] as TeamEntry[],
    };
    bucket.seconds += secondsBetween(entry.clockInAt, entry.clockOutAt ?? now);
    bucket.entries.push(entry);
    byUser.set(entry.userId, bucket);
  }
  const teamRows = [...byUser.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const teamSeconds = teamRows.reduce((sum, row) => sum + row.seconds, 0);

  const weekHref = (date: Date) => `/time-clock?week=${toDateParam(date)}`;
  const exportHref = `/time-clock/export?week=${toDateParam(start)}`;
  const isThisWeek = toDateParam(start) === toDateParam(weekStart(now));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ICONS.timeClock}
        title="Time clock"
        description="Clock in when you start, clock out when you finish. That's it."
      />

      <ClockCard
        openSinceISO={openEntry ? openEntry.clockInAt.toISOString() : null}
        // Formatted here rather than in the browser: `toLocaleTimeString` in a
        // component that also renders on the server picks a different zone on
        // each side and React reports the difference as a hydration mismatch.
        openSinceLabel={openEntry ? format(openEntry.clockInAt, "h:mm a") : null}
        todaySeconds={todaySeconds}
        weekSeconds={weekSeconds}
      />

      {/* ------------------------------------------------------------ mine */}
      <Card>
        <CardHeader
          icon={ICONS.timeClock}
          title="Today"
          description={`${formatHours(weekSeconds)} logged this week${
            isThisWeek ? "" : ` (week of ${format(start, "MMM d")})`
          }`}
        />

        {todayEntries.length === 0 ? (
          <EmptyState
            icon={ICONS.timeClock}
            title="Nothing logged today"
            hint="Press Clock in above when you start your shift and it will show up here."
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>In</Th>
                <Th>Out</Th>
                <Th className="text-right">Hours</Th>
                <Th>Note</Th>
              </Tr>
            </THead>
            <TBody>
              {todayEntries.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="font-medium">{format(entry.clockInAt, "h:mm a")}</Td>
                  <Td>
                    {entry.clockOutAt ? (
                      format(entry.clockOutAt, "h:mm a")
                    ) : (
                      <StatusPill tone="active" label="Running" size="sm" />
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatHours(
                      secondsBetween(entry.clockInAt, entry.clockOutAt ?? now),
                    )}
                  </Td>
                  <Td
                    className="max-w-xs truncate text-muted-foreground"
                    title={entry.note ?? undefined}
                  >
                    {entry.note ?? "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* ------------------------------------------------------------ team */}
      {isOwner ? (
        <Card>
          <CardHeader
            icon={ICONS.team}
            title={`The team · ${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`}
            description={`${formatHours(teamSeconds)} across ${
              teamRows.length === 1 ? "1 person" : `${teamRows.length} people`
            }`}
            action={
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={weekHref(addDays(start, -7))}
                        aria-label="Previous week"
                      >
                        <ChevronLeft className="size-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous week</TooltipContent>
                </Tooltip>
                {isThisWeek ? null : (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={weekHref(now)}>This week</Link>
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="outline" size="sm">
                      <Link href={weekHref(addDays(start, 7))} aria-label="Next week">
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next week</TooltipContent>
                </Tooltip>
                <Button asChild variant="soft" size="sm">
                  <a href={exportHref}>
                    <ACTIONS.download className="size-4" />
                    Export CSV
                  </a>
                </Button>
              </>
            }
          />

          {teamRows.length === 0 ? (
            <EmptyState
              icon={ICONS.timeClock}
              title="Nobody clocked in this week"
              hint="Shifts appear here as soon as somebody presses Clock in."
            />
          ) : (
            <div className="flex flex-col">
              {teamRows.map((row) => (
                <div key={row.name} className="border-b border-border last:border-0">
                  <div className="flex items-center justify-between gap-3 bg-surface-hover px-5 py-2.5">
                    <span className="text-[14px] font-bold text-foreground">
                      {row.name}
                    </span>
                    <span className="font-mono text-[14px] font-semibold tabular-nums text-muted-foreground">
                      {formatHours(row.seconds)}
                    </span>
                  </div>
                  <Table>
                    <TBody>
                      {row.entries.map((entry) => (
                        <Tr key={entry.id}>
                          <Td className="font-medium">
                            {format(entry.clockInAt, "EEE MMM d")}
                          </Td>
                          <Td>{format(entry.clockInAt, "h:mm a")}</Td>
                          <Td>
                            {entry.clockOutAt ? (
                              format(entry.clockOutAt, "h:mm a")
                            ) : (
                              <StatusPill tone="active" label="Running" size="sm" />
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatHours(
                              secondsBetween(entry.clockInAt, entry.clockOutAt ?? now),
                            )}
                          </Td>
                          <Td
                            className="max-w-[16rem] truncate text-muted-foreground"
                            title={entry.note ?? undefined}
                          >
                            {entry.note ?? "—"}
                          </Td>
                          <Td className="w-24">
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
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
