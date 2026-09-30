"use client";

import * as React from "react";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { ListKeyboardNav } from "@/components/list/keyboard-nav";
import { CommandPalette } from "@/components/search/command-palette";
import type { UiPrefs } from "@/lib/prefs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SwitcherLocation } from "./location-switcher";
import { Topbar } from "./topbar";
import type { CurrentUser } from "./user-menu";

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
    <TooltipProvider delayDuration={400}>
      {/*
        `data-density` is set here, once, and every rule that reacts to it lives
        in globals.css. A screen never asks what density it is in — it just
        inherits smaller row padding and shorter controls, the same way it
        inherits a colour.
      */}
      <div
        data-density={prefs.density}
        className="flex h-dvh w-full flex-col overflow-hidden bg-background"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar
            user={user}
            locations={locations}
            currentLocationId={currentLocationId}
            onSearchClick={() => setSearchOpen(true)}
            density={prefs.density}
            theme={prefs.theme}
            simple={prefs.simple}
          />
          <main className="min-h-0 flex-1 overflow-y-auto pt-6 pb-28">
            <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 xl:px-12">{children}</div>
          </main>
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
    </TooltipProvider>
  );
}
