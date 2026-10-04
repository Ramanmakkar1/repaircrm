import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, StatTile } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { TONE_CLASS, type StatusTone } from "@/components/ui/badge";

/**
 * The two boxes this page is built from.
 *
 * `KpiTile` is the shared `StatTile`, optionally made a link — the report's
 * headline row is the same metric tile the rest of the app uses, so a number
 * here and the same number on the dashboard are the same object.
 * `ReportCard` is the titled panel every chart sits in, with an optional
 * right-hand action (an export link, a jump to the matching list screen).
 */

export type KpiTileProps = {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatusTone;
  /** When the figure has a list behind it, the whole tile opens it. */
  href?: string;
};

/**
 * `stat` is the dense dashboard tile (Full mode). `large` and `small` are the
 * Easy-mode "figure" tiles: the label in plain words, the number big enough to
 * read across the counter, and one quiet line of context under it. `large` is
 * for the two or three numbers a shop owner actually opens this page for.
 */
export function KpiTile({
  variant = "stat",
  ...props
}: KpiTileProps & { variant?: "stat" | "large" | "small" }) {
  if (variant !== "stat") return <FigureTile size={variant} {...props} />;
  return <StatKpiTile {...props} />;
}

function FigureTile({
  size,
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
}: KpiTileProps & { size: "large" | "small" }) {
  const large = size === "large";
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border border-border bg-surface",
        large ? "gap-3 p-5" : "gap-2 p-4",
        href && "transition-colors group-hover:border-ring",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl",
            large ? "size-10" : "size-8",
            TONE_CLASS[tone].chip,
          )}
        >
          <Icon className={large ? "size-5" : "size-4"} />
        </span>
        <span
          className={cn(
            "min-w-0 font-semibold text-muted-foreground",
            large ? "text-base" : "text-[15px]",
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          "rf-num break-words font-semibold leading-none tracking-tight text-foreground",
          large ? "text-4xl" : "text-2xl",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-sm leading-snug text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );

  if (!href) return body;

  return (
    <Link
      href={href}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

function StatKpiTile({
  label,
  value,
  hint,
  icon,
  tone,
  href,
}: KpiTileProps) {
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
