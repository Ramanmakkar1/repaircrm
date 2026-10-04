import * as React from "react";
import Link from "next/link";

import { cn } from "@/components/ui/cn";

/** The one box every block of the overview sits in: the same card the Home and list screens use. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5", className)} {...props} />;
}

/** A section title with, optionally, the one link that opens the full screen. */
export function SectionTitle({
  id,
  title,
  hint,
  href,
  linkLabel,
  className,
}: {
  id: string;
  title: string;
  /** One quiet line under the title. */
  hint?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-semibold leading-tight tracking-tight">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-[15px] text-muted-foreground">{hint}</p> : null}
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          data-touch-control
          className="inline-flex min-h-11 items-center rounded-lg px-1 text-[15px] font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {linkLabel}
          <span aria-hidden className="ml-1">
            →
          </span>
        </Link>
      ) : null}
    </div>
  );
}

/** A count pill link ("Due today 3"): the same look as an idle FilterTabs tab. */
export function CountLink({ href, label, count, alert }: { href: string; label: string; count: number; alert?: boolean }) {
  return (
    <Link
      href={href}
      data-touch-control
      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <span
        className={cn(
          "rf-num min-w-6 rounded-full px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums",
          alert && count > 0 ? "bg-status-overdue-bg text-status-overdue-fg" : "bg-surface-hover text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
