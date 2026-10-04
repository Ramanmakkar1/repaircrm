import Link from "next/link";

import { cn } from "@/components/ui/cn";
import { RevealActiveTab } from "@/components/ui/reveal-active-tab";
import { visitsWord, type StripDay } from "./agenda";

/**
 * The week as seven big day chips: "Today / Oct 4 / 2 visits". Tapping one
 * opens that day. The chosen day is filled; today says "Today" in words, so it
 * is never found by colour alone. On a phone the row scrolls sideways and the
 * chosen day is brought into view.
 */
export function DayStrip({
  days,
  dayHref,
  className,
}: {
  days: StripDay[];
  dayHref: (key: string) => string;
  className?: string;
}) {
  return (
    <RevealActiveTab>
      <div
        role="navigation"
        aria-label="Days of the week"
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-7 sm:overflow-visible [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {days.map((day) => (
          <Link
            key={day.key}
            href={dayHref(day.key)}
            scroll={false}
            data-touch-control
            aria-current={day.selected ? "page" : undefined}
            className={cn(
              "flex min-h-[4.5rem] min-w-[5.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-center transition-colors sm:min-w-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              day.selected
                ? "border-accent bg-accent text-accent-foreground"
                : day.isToday
                  ? "border-accent bg-surface text-foreground ring-1 ring-accent hover:bg-surface-hover"
                  : "border-border bg-surface text-foreground hover:border-ring",
            )}
          >
            <span className={cn("text-[15px] leading-tight", day.isToday ? "font-bold" : "font-semibold")}>{day.label}</span>
            <span className={cn("text-sm leading-tight", day.selected ? "text-accent-foreground/80" : "text-muted-foreground")}>
              {day.date}
            </span>
            <span
              className={cn(
                "rf-num mt-0.5 rounded-full px-2 py-0.5 text-[13px] font-semibold leading-tight",
                day.selected
                  ? "bg-accent-foreground/15 text-accent-foreground"
                  : day.visits > 0
                    ? "bg-accent-soft text-accent-soft-foreground"
                    : "text-muted-foreground",
              )}
            >
              {visitsWord(day.visits)}
            </span>
          </Link>
        ))}
      </div>
    </RevealActiveTab>
  );
}
