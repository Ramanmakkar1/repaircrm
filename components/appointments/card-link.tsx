import * as React from "react";
import Link from "next/link";

import { cn } from "@/components/ui/cn";

/**
 * `RecordCard` (components/ui/record-card.tsx) with one difference: its link
 * keeps the scroll position (`scroll={false}`).
 *
 * An appointment card does not go to another page, it opens the edit dialog
 * over this one (`?edit=<id>`). Without `scroll={false}` Next jumps back to the
 * top when the page header is off screen, so on a phone, where this list is the
 * whole page, opening and closing a booking would mean scrolling all the way
 * down again. The calendar grid, the Today strip and the More > Edit item all
 * keep their place for the same reason.
 *
 * The markup and classes are the shared card's, so it looks identical. If
 * `RecordCard` ever grows a `scroll` prop, swap this back to it.
 */
export function AppointmentCardLink({
  href,
  visual,
  title,
  subtitle,
  meta,
  status,
  className,
}: {
  href: string;
  visual?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "group flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-4",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {visual ? <span className="shrink-0">{visual}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate text-lg font-semibold leading-tight">{title}</span>
          {status ? <span className="shrink-0">{status}</span> : null}
        </span>
        {subtitle ? <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">{subtitle}</span> : null}
        {meta ? <span className="mt-1 flex flex-wrap items-center gap-1.5">{meta}</span> : null}
      </span>
    </Link>
  );
}
