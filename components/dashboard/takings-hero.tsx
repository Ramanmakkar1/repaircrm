import Link from "next/link";
import { Banknote, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { compactCents } from "@/components/reports/charts";
import { formatCents } from "@/lib/money";
import { plainMoney, type TakingsComparison } from "@/lib/dashboard/logic";
import type { TodaySection } from "@/lib/dashboard/overview";
import { Panel } from "./panel";

/**
 * "Takings today": the one number a shop owner opens this page for.
 *
 * The big figure is net of refunds, exactly Reports' "Net revenue" for today.
 * Under it, in plain words, how that compares with yesterday; the three ways it
 * arrived (cash, card, other); and the last seven days as bars. Every bar
 * prints its amount and opens Reports for that day.
 */
export function TakingsHero({ today, className }: { today: TodaySection; className?: string }) {
  const chips = [
    { label: "Cash", cents: today.cashCents },
    { label: "Card", cents: today.cardCents },
    { label: "Other", cents: today.otherCents },
  ];
  return (
    <Panel aria-labelledby="takings-title" className={cn("grid gap-x-5 gap-y-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-4", className)}>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="takings-title" className="flex items-center gap-2 text-lg font-semibold leading-tight">
            <Banknote className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            Takings today
          </h2>
          <Link
            href={today.todayHref}
            data-touch-control
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-[15px] font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reports
            <span aria-hidden className="ml-1">
              →
            </span>
          </Link>
        </div>

        <p className="rf-num text-[44px] font-semibold leading-none tracking-tight sm:text-5xl" data-testid="takings-amount">
          {formatCents(today.netCents)}
        </p>

        <Comparison comparison={today.comparison} />

        <ul className="mt-auto flex flex-wrap gap-1.5" aria-label="How it was paid">
          {chips.map((chip) => (
            <li key={chip.label} className="rounded-lg bg-surface-hover px-2.5 py-1.5 text-sm">
              <span className="text-muted-foreground">{chip.label}</span> <span className="rf-num font-semibold">{plainMoney(chip.cents)}</span>
            </li>
          ))}
          {today.refundCents > 0 ? (
            <li className="rounded-lg bg-surface-hover px-2.5 py-1.5 text-sm">
              <span className="text-muted-foreground">Refunded</span> <span className="rf-num font-semibold">{plainMoney(today.refundCents)}</span>
            </li>
          ) : null}
        </ul>
      </div>

      <WeekBars days={today.days} totalCents={today.weekNetCents} />
    </Panel>
  );
}

const COMPARISON_STYLE: Record<TakingsComparison["kind"], string> = {
  up: "bg-status-resolved-bg text-status-resolved-fg",
  down: "bg-status-in-progress-bg text-status-in-progress-fg",
  same: "bg-surface-hover text-muted-foreground",
  first: "bg-status-new-bg text-status-new-fg",
  none: "bg-surface-hover text-muted-foreground",
};

/** The comparison as words with an arrow: the arrow only backs the sentence up. */
export function Comparison({ comparison }: { comparison: TakingsComparison }) {
  const Icon = comparison.kind === "up" ? TrendingUp : comparison.kind === "down" ? TrendingDown : Minus;
  return (
    <p className={cn("inline-flex w-fit max-w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[15px] font-semibold leading-snug", COMPARISON_STYLE[comparison.kind])}>
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span>{comparison.text}</span>
    </p>
  );
}

type WeekDay = TodaySection["days"][number];

/**
 * The last seven days as bars, today last. Each bar is a link to Reports for
 * that day, so its accessible name is the day and the amount (read from hidden
 * text); the printed amount, the weekday initial and the date number are
 * decoration on top of that. Today is the filled bar with the bold label; the others are quieter, so
 * nothing relies on colour alone. Bars grow in once (a short transition that
 * `prefers-reduced-motion` switches off); the final state is the default, so
 * nothing waits on the animation to be visible.
 */
export function WeekBars({ days, totalCents }: { days: readonly WeekDay[]; totalCents: number }) {
  const max = Math.max(1, ...days.map((day) => Math.max(0, day.netCents)));
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">Last 7 days</span>
        <span className="rf-num text-muted-foreground">{formatCents(totalCents)} in all</span>
      </figcaption>
      <ol className="grid min-h-36 flex-1 grid-cols-7 gap-1">
        {days.map((day) => {
          const height = day.netCents > 0 ? Math.max(4, (day.netCents / max) * 100) : 0;
          return (
            <li key={day.key} className="min-w-0">
              <Link
                href={day.href}
                data-touch-control
                aria-current={day.isToday ? "date" : undefined}
                className="flex h-full flex-col gap-1 rounded-lg px-0.5 py-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* The link's name is this sentence, read from its content (not an aria-label, which would hide the printed amount from its own name). */}
                <span className="sr-only">
                  {day.isToday ? "Today, " : ""}
                  {day.label}: {formatCents(day.netCents)} taken. Open this day in Reports.
                </span>
                <span aria-hidden className={cn("text-center text-[11px] leading-none tabular-nums", day.isToday ? "font-bold text-foreground" : "font-semibold text-muted-foreground")}>
                  {compactCents(day.netCents)}
                </span>
                <span aria-hidden className="flex min-h-14 flex-1 items-end">
                  <span
                    className={cn(
                      "block min-h-0.5 w-full origin-bottom rounded-t-md transition-transform duration-700 ease-out starting:scale-y-0 motion-reduce:transition-none",
                      day.isToday ? "bg-accent" : "bg-border-strong",
                    )}
                    style={{ height: `${height}%` }}
                  />
                </span>
                <span aria-hidden className="flex flex-col items-center leading-tight">
                  <span className={cn("text-[13px]", day.isToday ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>{day.initial}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{day.dayOfMonth}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
