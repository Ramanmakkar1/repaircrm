"use client";

import * as React from "react";
import { ListKeyboardNav } from "@/components/list/keyboard-nav";
import { CommandPalette } from "@/components/search/command-palette";
import type { UiPrefs } from "@/lib/prefs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SwitcherLocation } from "./location-switcher";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { CurrentUser } from "./user-menu";

export function AppShell({
  user,
  showPlatformAdmin,
  locations,
  currentLocationId,
  prefs,
  children,
}: {
  user: CurrentUser;
  showPlatformAdmin: boolean;
  /** Active branches, for the topbar switcher. */
  locations: SwitcherLocation[];
  currentLocationId: string;
  /** Per-device display preferences, read from the cookie on the server. */
  prefs: UiPrefs;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // The shell owns palette state so both the topbar button and the global ⌘K
  // handler inside CommandPalette drive the same dialog.
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={400}>
      {/*
        `data-density` is set here, once, and every rule that reacts to it lives
        in globals.css. A screen never asks what density it is in — it just
        inherits smaller row padding and shorter controls, the same way it
        inherits a colour.
      */}
      <div
        data-density={prefs.density}
        className="flex h-dvh w-full overflow-hidden bg-background"
      >
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          collapsed={prefs.railCollapsed}
          showPlatformAdmin={showPlatformAdmin}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={user}
            locations={locations}
            currentLocationId={currentLocationId}
            onMenuClick={() => setMobileOpen(true)}
            onSearchClick={() => setSearchOpen(true)}
            density={prefs.density}
          />
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {/* j/k down a list, Enter to open. Renders nothing; finds its rows by
          the attribute RowLink emits, so no list has to opt in. */}
      <ListKeyboardNav />
    </TooltipProvider>
  );
}
