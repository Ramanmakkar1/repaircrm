"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS } from "./nav-items";

/**
 * Big, obvious nav rows: a tinted icon chip plus a 15px label, so the sidebar
 * reads as a row of buttons rather than a list of links. The active row keeps
 * the accent tint on both the chip and the row itself.
 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
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
              "group flex items-center gap-3 rounded-md px-2.5 py-2 text-[15px] font-semibold transition-colors",
              isActive
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-surface text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2.25} />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
