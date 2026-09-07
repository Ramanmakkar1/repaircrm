import * as React from "react";
import Link from "next/link";
import { cn } from "./cn";

/**
 * Saved views, as underline tabs.
 *
 * Every list screen in the app had grown its own row of `rounded-full` pills —
 * tickets, purchase orders, invoices, leads, campaigns — each hand-rolled,
 * each slightly different, and the selected one rendered as a filled indigo
 * lozenge that outshouted the data underneath it. That is the loudest possible
 * way to say "you are looking at the open ones".
 *
 * This is the one filter control. It reads as a set of views over the same
 * table rather than as a set of buttons: quiet labels on a hairline, the
 * current one marked by weight and a 2px underline in the same accent the
 * sidebar uses for the current page. Counts sit beside their label in the
 * muted tone, so an empty view announces itself before you click it.
 *
 * Tabs are links, not state. These lists already drive off search params, so
 * a view is a URL — shareable, bookmarkable, and back-button correct.
 */
export interface FilterTab {
  label: string;
  href: string;
  active?: boolean;
  /** Rendered beside the label. Pass `0` and it still shows — that is the point. */
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
   * Rendered at the end of the strip, on the same hairline.
   *
   * This is where the saved-views control lives. It belongs ON the strip
   * rather than beside it, because saving a view is an act about this row of
   * tabs — anywhere else and it reads as a page-level action.
   */
  trailing?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  if (tabs.length === 0 && !trailing) return null;

  return (
    <div
      className={cn(
        // the hairline runs the full width, so the tabs sit ON a line rather
        // than floating above the content they filter
        "flex items-center gap-1 overflow-x-auto border-b border-border",
        className,
      )}
      role="navigation"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => (
        <Link
          /*
            Keyed on href AND label, because href alone is not unique. A saved
            view can point at exactly the same URL as a built-in tab — save
            "Waiting for Parts" under your own name for it and the strip has
            two entries with one href. React then warns about duplicate keys
            and is free to drop or duplicate one of them, which it did.

            The product prevents that duplicate being created in the first
            place (see components/list/saved-views.tsx), but data that already
            exists does not care what the product decided afterwards, and a
            primitive should not fall over because two things agree.
          */
          key={`${tab.href}|${tab.label}`}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "relative shrink-0 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-[13.5px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            tab.active
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span
              className={cn(
                "rf-num ml-1.5 text-[12.5px] font-medium",
                tab.active ? "text-muted-foreground" : "text-faint-foreground",
              )}
            >
              {tab.count}
            </span>
          ) : null}
          {tab.active ? (
            <span
              aria-hidden
              // -1px so the underline covers the container's own hairline
              className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent"
            />
          ) : null}
        </Link>
      ))}
      {trailing ? <div className="ml-1 shrink-0 pb-1.5">{trailing}</div> : null}
    </div>
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
        <span className="mr-0.5 text-[12.5px] font-medium text-faint-foreground">
          {label}
        </span>
      ) : null}
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
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
