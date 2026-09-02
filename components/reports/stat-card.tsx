import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, StatTile } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { StatusTone } from "@/components/ui/badge";

/**
 * The two boxes this page is built from.
 *
 * `KpiTile` is the shared `StatTile`, optionally made a link — the report's
 * headline row is the same metric tile the rest of the app uses, so a number
 * here and the same number on the dashboard are the same object.
 * `ReportCard` is the titled panel every chart sits in, with an optional
 * right-hand action (an export link, a jump to the matching list screen).
 */

export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatusTone;
  /** When the figure has a list behind it, the whole tile opens it. */
  href?: string;
}) {
  const tile = (
    <StatTile
      icon={icon}
      tone={tone}
      value={value}
      label={label}
      hint={hint}
      // `interactive` is the shared hover/focus treatment; it reacts to the
      // link's focus through `focus-within`, so the anchor only has to be the
      // hit target.
      interactive={Boolean(href)}
      className="h-full"
    />
  );

  if (!href) return tile;

  return (
    <Link href={href} className="rounded-lg focus-visible:outline-none">
      {tile}
    </Link>
  );
}

export function ReportCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-[13.5px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 py-5">{children}</CardContent>
    </Card>
  );
}

/** The small "Export CSV" / "All invoices" link in a card header. */
export function CardLink({
  href,
  children,
  download,
}: {
  href: string;
  children: React.ReactNode;
  download?: boolean;
}) {
  const className =
    "inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-xs";

  // A CSV route is a download, not a route transition — a plain <a> keeps the
  // router out of it so the browser handles Content-Disposition itself.
  if (download) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}
