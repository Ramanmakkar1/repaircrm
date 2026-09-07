"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { setRailCollapsedAction } from "@/app/(app)/prefs-actions";
import { cn } from "@/components/ui/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export function Sidebar({
  mobileOpen,
  onClose,
  collapsed,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  /**
   * Desktop only. The mobile drawer is always full width — a 60px icon strip
   * over a phone screen would be a worse version of the bottom of the topbar.
   */
  collapsed: boolean;
}) {
  return (
    <>
      {/*
        Desktop rail. It is white against the light-gray canvas — the fill plus
        the single hairline on its right edge is what makes it read as a rail,
        and the brand block's own hairline lines up exactly with the topbar's.

        Collapsed it is 60px of glyphs. 240px of navigation is a lot to give up
        on a 1280 laptop when the thing you are actually reading is a ticket,
        and the choice is remembered per device — the counter tablet and the
        back-office monitor want different answers.
      */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-sidebar-bg transition-[width] duration-150 ease-out md:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <Brand compact={collapsed} />
        </div>

        <NavLinks collapsed={collapsed} />

        <CollapseToggle collapsed={collapsed} />
      </aside>

      {/* mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar-bg shadow-xl transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-5" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
      </aside>
    </>
  );
}

/**
 * The collapse control, pinned to the bottom of the rail.
 *
 * Bottom rather than top on purpose: it is a preference you set once and then
 * forget, so it should not sit in the same glance as the navigation you use
 * every minute.
 *
 * The write is a server action because the server decides the rail's width on
 * the next render — see `lib/prefs.ts`. `useTransition` keeps the click from
 * blocking, and the layout revalidation is what actually moves the rail.
 */
function CollapseToggle({ collapsed }: { collapsed: boolean }) {
  const [pending, start] = React.useTransition();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";

  const button = (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void setRailCollapsedAction(!collapsed))}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors",
        "hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:opacity-60",
        collapsed ? "w-9 justify-center" : "w-full px-3",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );

  return (
    <div
      className={cn(
        "mt-auto flex shrink-0 border-t border-border py-2",
        collapsed ? "justify-center px-0" : "px-2.5",
      )}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
}
