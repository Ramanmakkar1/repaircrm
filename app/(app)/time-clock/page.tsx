import Link from "next/link";
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
import { ClockPanel } from "@/components/time-clock/clock-panel";
import { TeamWeek, TodayShifts } from "@/components/time-clock/shift-cards";
import { clockTime, forgottenShift, shiftDay } from "@/components/time-clock/shift-meta";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { addDaysToKey, dayKeyLabel, wallDateTimeValue } from "@/lib/dashboard/zone";
import { readUiPrefs } from "@/lib/prefs";
import { EntryDialog } from "./entry-dialog";
import { formatHours, secondsBetween, shopWeek } from "./meta";

export const metadata = { title: "Time clock · Repairs helper" };

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
  const [params, { simple }, zone] = await Promise.all([searchParams, readUiPrefs(), loadShopZone(shopId)]);
  const isOwner = role === "OWNER";

  // One request-time clock, so every duration on the page is measured against
  // the same instant rather than each row reaching for its own.
  const now = new Date();

  // The week and "today" are the SHOP'S, cut at its own midnight (Shop.timezone), never the server's.
  const week = shopWeek(one(params.week), now.getTime(), zone);
  const start = week.from;

  const [mine, team] = await Promise.all([
    // My own week, always — a technician needs their own hours even though they
    // cannot see anyone else's.
    db.timeClockEntry.findMany({
      where: { shopId, userId, clockInAt: { gte: start, lt: week.toExclusive } },
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
          where: { shopId, clockInAt: { gte: start, lt: week.toExclusive } },
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
  const forgot = openEntry ? forgottenShift(openEntry, now, zone) : null;

  const dayStart = week.todayFrom;
  const dayEnd = week.todayToExclusive;
  const isToday = (at: Date) => at >= dayStart && at < dayEnd;

  const todaySeconds = mine
    .filter((entry) => isToday(entry.clockInAt))
    // A running entry counts up to the render's clock; the ticker in ClockPanel
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

  const todayEntries = mine.filter((entry) => isToday(entry.clockInAt));
  const todayWorked = todayEntries.reduce(
    (sum, entry) => sum + secondsBetween(entry.clockInAt, entry.clockOutAt ?? now),
    0,
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

  const weekHref = (key: string) => `/time-clock?week=${key}`;
  const exportHref = `/time-clock/export?week=${week.monday}`;
  const isThisWeek = week.isThisWeek;
  const weekTitle = `${dayKeyLabel(week.monday, { month: "short", day: "numeric" })} – ${dayKeyLabel(week.sunday, { month: "short", day: "numeric", year: "numeric" })}`;
  const weekOf = isThisWeek ? "" : ` (week of ${dayKeyLabel(week.monday, { month: "short", day: "numeric" })})`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Time clock"
        description="Clock in when you start, clock out when you finish. That's it."
      />

      <ClockPanel
        openSinceISO={openEntry ? openEntry.clockInAt.toISOString() : null}
        // Formatted here, on the shop's clock, rather than in the browser:
        // `toLocaleTimeString` in a component that also renders on the server
        // picks a different zone on each side and React reports the difference
        // as a hydration mismatch.
        openSinceLabel={openEntry ? clockTime(openEntry.clockInAt, zone) : null}
        todaySeconds={todaySeconds}
        weekSeconds={weekSeconds}
        forgotSince={forgot?.since ?? null}
        ownerFixes={isOwner}
      />

      {/* ------------------------------------------------------------ mine */}
      {simple ? (
        <TodayShifts
          entries={todayEntries}
          now={now}
          zone={zone}
          caption={
            todayEntries.length === 0
              ? `${formatHours(weekSeconds)} this week${weekOf}`
              : `${formatHours(todayWorked)} worked today`
          }
        />
      ) : (
      <Card>
        <CardHeader
          icon={ICONS.timeClock}
          title="Today"
          description={`${formatHours(weekSeconds)} logged this week${weekOf}`}
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
                  <Td className="font-medium">{clockTime(entry.clockInAt, zone)}</Td>
                  <Td>
                    {entry.clockOutAt ? (
                      clockTime(entry.clockOutAt, zone)
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
      )}

      {/* ------------------------------------------------------------ team */}
      {isOwner && simple ? (
        <TeamWeek
          rows={teamRows}
          now={now}
          start={start}
          end={week.toExclusive}
          title={weekTitle}
          zone={zone}
          totalSeconds={teamSeconds}
          isThisWeek={isThisWeek}
          prevHref={weekHref(addDaysToKey(week.monday, -7))}
          thisWeekHref={weekHref(week.todayKey)}
          nextHref={weekHref(addDaysToKey(week.monday, 7))}
          exportHref={exportHref}
        />
      ) : isOwner ? (
        <Card>
          <CardHeader
            icon={ICONS.team}
            title={`The team · ${weekTitle}`}
            description={`${formatHours(teamSeconds)} across ${
              teamRows.length === 1 ? "1 person" : `${teamRows.length} people`
            }`}
            action={
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={weekHref(addDaysToKey(week.monday, -7))}
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
                    <Link href={weekHref(week.todayKey)}>This week</Link>
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="outline" size="sm">
                      <Link href={weekHref(addDaysToKey(week.monday, 7))} aria-label="Next week">
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next week</TooltipContent>
                </Tooltip>
                <Button asChild variant="soft" size="sm">
                  <a href={exportHref}>
                    <ACTIONS.download className="size-4" />
                    Download timesheet
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
                            {shiftDay(entry.clockInAt, zone)}
                          </Td>
                          <Td>{clockTime(entry.clockInAt, zone)}</Td>
                          <Td>
                            {entry.clockOutAt ? (
                              clockTime(entry.clockOutAt, zone)
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
                          <Td className="w-40">
                            <EntryDialog
                              entryId={entry.id}
                              userName={entry.user.name}
                              clockInValue={wallDateTimeValue(entry.clockInAt.getTime(), zone)}
                              clockOutValue={
                                entry.clockOutAt
                                  ? wallDateTimeValue(entry.clockOutAt.getTime(), zone)
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
