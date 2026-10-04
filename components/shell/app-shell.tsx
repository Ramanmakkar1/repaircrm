"use client";

import * as React from "react";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { ListKeyboardNav } from "@/components/list/keyboard-nav";
import { CommandPalette } from "@/components/search/command-palette";
import type { UiPrefs } from "@/lib/prefs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SwitcherLocation } from "./location-switcher";
import { WorkspaceControls } from "./workspace-controls";
import type { CurrentUser } from "./user-menu";
import { InstallProvider } from "@/components/pwa/install-provider";
import { MobileNavigation } from "./mobile-navigation";

export function AppShell({
  user,
  locations,
  currentLocationId,
  prefs,
  assistant,
  children,
}: {
  user: CurrentUser;
  /** Active branches, for the topbar switcher. */
  locations: SwitcherLocation[];
  currentLocationId: string;
  /** Per-device display preferences, read from the cookie on the server. */
  prefs: UiPrefs;
  assistant: { enabled: boolean; cloud: boolean };
  children: React.ReactNode;
}) {
  // The shell owns palette state so both the topbar button and the global ⌘K
  // handler inside CommandPalette drive the same dialog.
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <InstallProvider><TooltipProvider delayDuration={400}>
      {/*
        `data-density` is set here, once, and every rule that reacts to it lives
        in globals.css. A screen never asks what density it is in — it just
        inherits smaller row padding and shorter controls, the same way it
        inherits a colour.
      */}
      <div
        data-density={prefs.density}
        data-touch-workspace={prefs.simple ? "true" : undefined}
        className="flex h-dvh w-full flex-col overflow-hidden bg-background"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="rf-gutter shrink-0 border-b border-border bg-surface pb-2 pt-[max(.5rem,env(safe-area-inset-top))]"><div className="mx-auto w-full max-w-[1440px]">
            <WorkspaceControls user={user} locations={locations} currentLocationId={currentLocationId} prefs={prefs} onSearch={() => setSearchOpen(true)} />
          </div></div>
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pt-5 pb-28">
            <div className="rf-gutter mx-auto w-full max-w-[1440px]">
              {children}
            </div>
          </main>
          <MobileNavigation role={user.role} />
        </div>
      </div>
      <AssistantLauncher
        enabled={assistant.enabled}
        cloud={assistant.cloud}
        owner={user.role === "OWNER"}
        name={user.name}
        showMoney={user.role !== "TECH"}
      />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {/* j/k down a list, Enter to open. Renders nothing; finds its rows by
          the attribute RowLink emits, so no list has to opt in. */}
      <ListKeyboardNav />
    </TooltipProvider></InstallProvider>
  );
}
