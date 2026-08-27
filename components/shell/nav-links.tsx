"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
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
  { label: "Shop", hrefs: ["/display", "/settings"] },
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

/**
 * A white rail of quiet rows. Definition comes from typography and one accent
 * tint rather than a chip on every line: at rest a row is a gray label with a
 * gray glyph, on hover it picks up a gray-50 fill, and the current page is an
 * unmistakable soft-indigo pill with an indigo icon and a darker label.
 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = groupNavItems();

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex h-10 items-center gap-3 rounded-md px-3 text-[14.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  isActive
                    ? "bg-accent-soft font-semibold text-accent-soft-foreground"
                    : "font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0 transition-colors",
                    isActive
                      ? "text-accent"
                      : "text-faint-foreground group-hover:text-muted-foreground",
                  )}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
