"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NAV_ITEMS, type NavItem } from "./nav-items";

/**
 * Grouping lives here, not in nav-items.ts — NAV_ITEMS stays a flat list that
 * anyone can append to, and the sidebar decides how to arrange it. An item
 * whose href isn't claimed by a group below still renders (under "More"), so
 * adding a nav entry can never make it silently disappear from the rail.
 */
const NAV_GROUPS: { label: string; hrefs: string[] }[] = [
  {
    label: "Work",
    hrefs: ["/dashboard", "/leads", "/appointments", "/customers", "/tickets"],
  },
  { label: "Money", hrefs: ["/estimates", "/invoices", "/pos", "/inventory"] },
  { label: "Grow", hrefs: ["/marketing", "/reports"] },
  { label: "Shop", hrefs: ["/display", "/time-clock", "/settings"] },
];

function groupNavItems(): { label: string; items: NavItem[] }[] {
  const claimed = new Set<string>();

  const groups = NAV_GROUPS.map((group) => {
    // iterate NAV_ITEMS (not group.hrefs) so the flat list keeps owning order
    const items = NAV_ITEMS.filter((item) => group.hrefs.includes(item.href));
    items.forEach((item) => claimed.add(item.href));
    return { label: group.label, items };
  }).filter((group) => group.items.length > 0);

  const leftovers = NAV_ITEMS.filter((item) => !claimed.has(item.href));
  return leftovers.length > 0
    ? [...groups, { label: "More", items: leftovers }]
    : groups;
}

/** A route owns the rail row for itself and everything nested beneath it. */
function isUnder(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A white rail of quiet rows.
 *
 * The current page is marked three ways at once — a 2px accent bar on the
 * left edge, a faint tint across the row, and the label in accent ink — which
 * together are far quieter than the filled indigo pill this replaced, while
 * being easier to find at a glance. The bar is what your eye tracks when you
 * scan the rail vertically.
 *
 * Sub-items appear only underneath the section you are actually in. That is
 * the whole trick behind a rail that stays short while the app keeps growing:
 * Inventory's vendors, purchase orders and importer are one click away when
 * you are in Inventory, and cost nothing when you are not.
 */
export function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  /**
   * Icons only, 60px rail. Group headings and sub-items disappear — a
   * three-letter caption over a column of glyphs is noise, and an indented
   * text sub-item has nothing to indent from.
   */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const groups = groupNavItems();

  return (
    <nav
      className={cn(
        "flex flex-1 flex-col overflow-y-auto py-4",
        collapsed ? "items-center gap-3 px-2" : "gap-5 px-2.5",
      )}
    >
      {groups.map((group) => (
        <div
          key={group.label}
          className={cn("flex flex-col gap-0.5", collapsed && "w-full items-center")}
        >
          {collapsed ? (
            // The groups still exist; the rule between them is what says so.
            <span aria-hidden className="mb-2 h-px w-6 bg-border first:hidden" />
          ) : (
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint-foreground">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const isActive = isUnder(pathname, item.href);
            const Icon = item.icon;
            const row = (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex h-8 items-center rounded-md text-[13.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  collapsed ? "w-9 justify-center" : "gap-2.5 pl-3 pr-2",
                  isActive
                    ? "bg-surface-hover font-semibold text-accent-soft-foreground"
                    : "font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {isActive && !collapsed ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent"
                  />
                ) : null}
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive
                      ? "text-accent"
                      : "text-faint-foreground group-hover:text-muted-foreground",
                  )}
                  strokeWidth={2}
                />
                {collapsed ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );

            return (
              <div key={item.href} className="flex flex-col gap-0.5">
                {collapsed ? (
                  // The label has to come back somewhere, or the rail is a
                  // memory test.
                  <Tooltip>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  row
                )}

                {/*
                  Children are words, not icons, and they only exist while you
                  are inside their section — so the rail never grows past what
                  the current task needs.
                */}
                {!collapsed && isActive && item.children
                  ? item.children.map((child) => {
                      const childActive = isUnder(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "flex h-7 items-center rounded-md pl-[38px] pr-2 text-[13px] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            childActive
                              ? "font-semibold text-accent-soft-foreground"
                              : "font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
