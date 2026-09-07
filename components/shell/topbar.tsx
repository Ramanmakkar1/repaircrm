"use client";

import { Menu } from "lucide-react";
import { SearchTrigger } from "@/components/search/search-trigger";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LocationSwitcher, type SwitcherLocation } from "./location-switcher";
import { NewMenu } from "./new-menu";
import type { Density } from "@/lib/prefs";
import { UserMenu, type CurrentUser } from "./user-menu";

export function Topbar({
  user,
  locations,
  currentLocationId,
  onMenuClick,
  onSearchClick,
  density,
}: {
  user: CurrentUser;
  /** Passed through to the user menu, which hosts the density control. */
  density: Density;
  /** Active branches. Fewer than two and the switcher is not rendered. */
  locations: SwitcherLocation[];
  currentLocationId: string;
  onMenuClick: () => void;
  onSearchClick: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onMenuClick}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
          >
            <Menu className="size-5" />
            <span className="sr-only">Open menu</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Menu</TooltipContent>
      </Tooltip>

      {/*
        Not an input any more. The old readonly field looked typeable and did
        nothing; this is a button that hands every keystroke to the ⌘K palette.
      */}
      <SearchTrigger onOpen={onSearchClick} />

      <div className="ml-auto flex items-center gap-2.5">
        {locations.length > 1 ? (
          <LocationSwitcher
            locations={locations}
            currentId={currentLocationId}
          />
        ) : null}
        <NewMenu />
        <UserMenu user={user} density={density} />
      </div>
    </header>
  );
}
