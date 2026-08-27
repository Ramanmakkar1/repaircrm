import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

/**
 * The two boxes this page is built from.
 *
 * `BigStat` is the dashboard's stat tile with the number turned up — a report
 * exists to be read across a room by an owner who wants one figure.
 * `ReportCard` is the titled panel every chart sits in, with an optional
 * right-hand action (an export link, a jump to the matching list screen).
 */

export function BigStat({
  label,
  value,
  hint,
  icon: Icon,
  tint = "bg-accent-soft text-accent-soft-foreground",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tint?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className={cn("flex size-12 items-center justify-center rounded-md", tint)}>
        <Icon className="size-6" strokeWidth={2.25} />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-[15px] font-bold text-foreground">{label}</span>
        {hint ? (
          <span className="text-[13px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </>
  );

  const shell =
    "flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm";

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(
        shell,
        "rf-lift hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {body}
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
