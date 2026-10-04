"use client";

import { usePathname } from "next/navigation";
import { Home, Search } from "lucide-react";
import type { UiPrefs } from "@/lib/prefs";
import { BackHomeControls } from "./back-button";
import { LocationSwitcher, type SwitcherLocation } from "./location-switcher";
import { NeedsYouButton } from "./needs-you";
import { UserMenu, type CurrentUser } from "./user-menu";

/**
 * The one controls row on every signed-in screen (no website masthead or
 * footer): Back and Home on the left; the shop, Search, Needs you and the
 * account on the right. Every control is 48px and says what it does.
 */
export function WorkspaceControls({ user, locations, currentLocationId, prefs, onSearch }: {
  user: CurrentUser; locations: SwitcherLocation[]; currentLocationId: string; prefs: UiPrefs; onSearch: () => void;
}) {
  const path = usePathname();
  const home = path === "/counter";
  return (
    <nav aria-label="Workspace controls" className="flex items-center justify-between gap-2 sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {!home ? <BackHomeControls path={path} /> : (
          <span className="flex min-h-12 items-center gap-2 text-[15px] font-semibold">
            <Home className="size-5" aria-hidden />
            <span className="hidden min-[360px]:inline">Your shop</span>
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {locations.length > 1 ? <LocationSwitcher locations={locations} currentId={currentLocationId} /> : null}
        <button
          type="button"
          onClick={onSearch}
          aria-keyshortcuts="Control+K Meta+K"
          className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-[15px] font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-4 lg:w-64 lg:justify-start lg:font-normal lg:text-muted-foreground"
        >
          <Search aria-hidden className="size-5 shrink-0 text-foreground" />
          <span className="sr-only sm:not-sr-only lg:hidden">Search</span>
          <span className="hidden truncate lg:inline">Search name, phone or #</span>
        </button>
        <NeedsYouButton />
        <UserMenu user={user} density={prefs.density} theme={prefs.theme} simple={prefs.simple} />
      </div>
    </nav>
  );
}
