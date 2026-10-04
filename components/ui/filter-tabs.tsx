import * as React from "react";
import Link from "next/link";
import { cn } from "./cn";
import { RevealActiveTab } from "./reveal-active-tab";

/**
 * The one filter control: big pill tabs, like the group tabs on Home.
 *
 * Every list screen shares it, so Repairs, Invoices, Stock and the rest all
 * read as one app. Each tab is a 44px+ touch target (48px in Easy mode), the
 * current one is filled solid and carries its count inside the pill, so an
 * empty view announces itself before you tap it and the current view is
 * never signalled by colour alone (fill AND `aria-current`).
 *
 * Tabs are links, not state. These lists already drive off search params, so
 * a view is a URL: shareable, bookmarkable, and back-button correct. On a
 * phone the row scrolls sideways rather than wrapping into a second line.
 */
export interface FilterTab {
  label: string;
  href: string;
  active?: boolean;
  /** Rendered inside the pill. Pass `0` and it still shows - that is the point. */
  count?: number;
}

export function FilterTabs({
  tabs,
  trailing,
  className,
  "aria-label": ariaLabel = "Views",
}: {
  tabs: FilterTab[];
  /**
   * Rendered at the end of the row. This is where the saved-views control
   * lives: saving a view is an act about this row of tabs, so it belongs on it.
   */
  trailing?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  if (tabs.length === 0 && !trailing) return null;

  return (
    <RevealActiveTab>
    <div
      className={cn("flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      role="navigation"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <Link
          /*
            Keyed on href AND label, because href alone is not unique. A saved
            view can point at exactly the same URL as a built-in tab - save
            "Waiting for Parts" under your own name for it and the row has two
            entries with one href. React then warns about duplicate keys and is
            free to drop or duplicate one of them, which it did. The product
            prevents that duplicate being created (components/list/saved-views.tsx),
            but data that already exists does not care what the product decided
            afterwards, and a primitive should not fall over because two things agree.
          */
          key={`${tab.href}|${tab.label}`}
          href={tab.href}
          data-touch-control
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.active
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span
              className={cn(
                "rf-num min-w-6 rounded-full px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums",
                tab.active ? "bg-accent-foreground/15 text-accent-foreground" : "bg-surface-hover text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
      {trailing ? <div className="ml-1 shrink-0">{trailing}</div> : null}
    </div>
    </RevealActiveTab>
  );
}

/**
 * A secondary filter — vendor, technician, location — that is a *choice*
 * rather than a view.
 *
 * Underline tabs claim the top of a table and there is only one such row per
 * screen, so the second axis of filtering renders as small removable chips on
 * the line below. Quiet by default, accent-tinted once set, so at a glance you
 * can tell a filtered table from a complete one.
 */
export function FilterChips({
  label,
  options,
  className,
}: {
  label?: string;
  options: { label: string; href: string; active?: boolean }[];
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label ? (
        <span className="mr-0.5 text-sm font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          data-touch-control
          aria-current={option.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            option.active
              ? "border-accent/30 bg-accent-soft text-accent-soft-foreground"
              : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
