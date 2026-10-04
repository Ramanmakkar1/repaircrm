import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

/**
 * The card every list screen is made of, so Repairs, Invoices, Customers and
 * Stock all read like the Home tiles: one big tap target, a picture or mark on
 * the left, a plain title, one quiet line, at most a few small facts, and the
 * state on the right.
 *
 *   [ visual ]  Title ............................ [ status ]
 *               one line of detail                [ trailing ]
 *               (fact) (fact) (fact)
 *
 * The whole card is the link. Status always carries its word (use StatusBadge
 * or StatusPill), never colour alone.
 */
export function RecordCard({
  href,
  visual,
  title,
  subtitle,
  meta,
  status,
  trailing,
  scroll,
  className,
}: {
  href: string;
  /** PhotoVisual, InitialsVisual or IconVisual. */
  visual?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A row of MetaChip. Keep it to three or fewer. */
  meta?: React.ReactNode;
  /** Top right: the status badge. */
  status?: React.ReactNode;
  /** Right edge, under the status: an amount, a date, a count. */
  trailing?: React.ReactNode;
  /** Pass false when the card opens a dialog on the same page, so the list keeps its scroll position. */
  scroll?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
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
      {trailing ? <span className="shrink-0 self-stretch text-right">{trailing}</span> : null}
    </Link>
  );
}

/** The responsive grid for a page of RecordCards: one column on a phone, two on a tablet, three on a wide screen. */
export function RecordGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3", className)}>{children}</ul>;
}

/** A product or device photo on its white canvas (photos are shot on white, in every theme). */
export function PhotoVisual({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  return (
    <span className={cn("relative block size-20 overflow-hidden rounded-xl bg-white sm:size-24", className)}>
      <Image src={src} alt={alt} fill sizes="96px" className="object-contain p-2" />
    </span>
  );
}

/** Initials in a soft circle: the picture for a person or a business. */
export function InitialsVisual({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      // Bold, so the 20px initials count as large text: blue on the soft fill is 4.3:1, enough for large text only.
      className={cn("flex size-16 items-center justify-center rounded-full bg-accent-soft text-xl font-bold text-accent-soft-foreground sm:size-20 sm:text-2xl", className)}
    >
      {initials}
    </span>
  );
}

/** A big icon in a soft square, for records with no picture (an invoice, a purchase order). */
export function IconVisual({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-16 items-center justify-center rounded-xl bg-surface-hover text-foreground sm:size-20", className)}>
      <Icon className="size-8" strokeWidth={1.6} />
    </span>
  );
}

/** A small fact on a card: "Due in 23h", "Parts: 1 ordered". Words always; the tone only adds emphasis. */
export function MetaChip({
  children,
  icon: Icon,
  tone = "neutral",
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "alert";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium leading-none",
        tone === "alert" ? "bg-destructive-soft text-destructive" : "bg-surface-hover text-muted-foreground",
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
