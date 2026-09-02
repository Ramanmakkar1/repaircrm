"use client";

import * as React from "react";
import { CommandPalette } from "@/components/search/command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SwitcherLocation } from "./location-switcher";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { CurrentUser } from "./user-menu";

export function AppShell({
  user,
  locations,
  currentLocationId,
  children,
}: {
  user: CurrentUser;
  /** Active branches, for the topbar switcher. */
  locations: SwitcherLocation[];
  currentLocationId: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // The shell owns palette state so both the topbar button and the global ⌘K
  // handler inside CommandPalette drive the same dialog.
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            user={user}
            locations={locations}
            currentLocationId={currentLocationId}
            onMenuClick={() => setMobileOpen(true)}
            onSearchClick={() => setSearchOpen(true)}
          />
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
