"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { setRailCollapsedAction } from "@/app/(app)/prefs-actions";
import { OPEN_SHOP_ASSISTANT } from "@/components/assistant/assistant-events";
import { countLabel } from "@/components/counter/attention";
import { cn } from "@/components/ui/cn";
import type { LucideIcon } from "@/components/ui/icons";
import { useAttention } from "./attention-provider";
import { activeTab, phoneTabs } from "./mobile-navigation";
import { railGroups, type RailItem } from "./rail-items";

/** A route owns the rail row for itself and everything nested beneath it. */
function isUnder(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

/** The most specific rail row for this address, so /invoices/recurring lights Recurring, not Invoices too. */
export function railCurrent(items: readonly { href: string }[], path: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (isUnder(path, item.href) && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/**
 * Easy mode from `lg` up: the phone's five tabs as a slim column on the left,
 * so Home, Repairs, Sell, Stock and Ask stay one tap away on a laptop or a
 * counter PC. Below `lg` the same five sit in the bottom bar.
 */
export function SlimRail({ role }: { role: string }) {
  const path = usePathname();
  const attention = useAttention();
  const total = attention?.total ?? 0;
  const tabs = phoneTabs(role);
  const current = activeTab(tabs, path);
  return (
    <nav aria-label="App navigation" className="hidden w-24 shrink-0 flex-col gap-1 border-r border-border bg-surface px-2 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] lg:flex print:hidden">
      {tabs.map(({ key, label, href, Icon }) => {
        const active = key === current;
        const badge = key === "home" && total > 0 ? total : 0;
        return (
          <Link
            key={href}
            href={href}
            // No data-touch-control: its 48px floor would override the 64px row.
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${label}, ${countLabel(badge)} need you` : undefined}
            className={cn(
              "relative flex h-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-6" strokeWidth={active ? 2.5 : 2} aria-hidden />
              {badge ? <span aria-hidden className="absolute -right-3.5 -top-2 min-w-5 rounded-full bg-destructive px-1 py-px text-center text-[12px] font-bold leading-4 tabular-nums text-destructive-foreground">{countLabel(badge)}</span> : null}
            </span>
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHOP_ASSISTANT))}
        aria-haspopup="dialog"
        className="flex h-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AudioLines className="size-6" aria-hidden />
        Ask
      </button>
    </nav>
  );
}

/**
 * Full view from `md` up: every area of the shop, in four groups, down the
 * left. Icons only up to `xl` (a 240px rail would leave a counter tablet a
 * 580px page), named from `xl`, where the owner can also fold it away. The
 * sub-pages of the area you are in (Suppliers, Purchase orders, Recurring
 * invoices...) open under it, so the rail stays short.
 */
export function GroupedRail({ role, collapsed }: { role: string; collapsed: boolean }) {
  const path = usePathname();
  const groups = railGroups(role);
  const all = groups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]));
  const current = railCurrent(all, path);
  const sectionOf = (item: RailItem) => [item, ...(item.children ?? [])].some((row) => row.href === current);
  // Named only from xl and only when the owner has not folded it.
  const named = collapsed ? "hidden" : "hidden xl:inline";
  return (
    <nav
      aria-label="All areas"
      className={cn(
        "hidden w-[68px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar-bg px-2 pb-2 pt-[max(.75rem,env(safe-area-inset-top))] md:flex print:hidden",
        !collapsed && "xl:w-60 xl:px-2.5",
      )}
    >
      <div className="flex flex-1 flex-col gap-4">
        <RailRow href="/counter" label="Home" Icon={Home} active={path === "/counter" || path.startsWith("/counter/")} named={named} />
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className={cn("px-2.5 pb-1 text-[12px] font-medium text-faint-foreground", collapsed ? "hidden" : "hidden xl:block")}>{group.label}</p>
            <span aria-hidden className={cn("mx-auto mb-1 h-px w-6 bg-border", !collapsed && "xl:hidden")} />
            {group.items.map((item) => (
              <div key={item.href} className="flex flex-col gap-0.5">
                <RailRow href={item.href} label={item.label} Icon={item.icon} active={current === item.href} named={named} />
                {sectionOf(item) && item.children?.length ? (
                  <div className={cn("flex-col gap-0.5", collapsed ? "hidden" : "hidden xl:flex")}>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        data-touch-control
                        aria-current={current === child.href ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center rounded-md pl-[38px] pr-2 text-[13px] transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          current === child.href ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                        )}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <CollapseToggle collapsed={collapsed} />
    </nav>
  );
}

function RailRow({ href, label, Icon, active, named }: { href: string; label: string; Icon: LucideIcon; active: boolean; named: string }) {
  return (
    <Link
      href={href}
      data-touch-control
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex h-10 items-center justify-center gap-2.5 rounded-md text-[13.5px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        named === "hidden xl:inline" && "xl:justify-start xl:pl-3 xl:pr-2",
        active ? "bg-accent font-semibold text-accent-foreground" : "font-medium text-foreground hover:bg-surface-hover",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", !active && "text-muted-foreground")} aria-hidden />
      <span className={cn("truncate", named)}>{label}</span>
      <span className={cn("sr-only", named === "hidden xl:inline" && "xl:hidden")}>{label}</span>
    </Link>
  );
}

/** Fold the named rail to icons (from xl, where it has names). Remembered per device. */
function CollapseToggle({ collapsed }: { collapsed: boolean }) {
  const [pending, start] = React.useTransition();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Show names" : "Icons only";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void setRailCollapsedAction(!collapsed))}
      title={label}
      className={cn(
        "mt-3 hidden h-9 items-center justify-center gap-2 rounded-md border-t border-border pt-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground xl:flex",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
        !collapsed && "xl:justify-start xl:px-3",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className={collapsed ? "sr-only" : undefined}>{label}</span>
    </button>
  );
}

