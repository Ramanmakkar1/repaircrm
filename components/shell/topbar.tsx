"use client";

import Link from "next/link";
import { Home, Menu } from "lucide-react";
import { SearchTrigger } from "@/components/search/search-trigger";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LocationSwitcher, type SwitcherLocation } from "./location-switcher";
import { NewMenu } from "./new-menu";
import type { Density, Theme } from "@/lib/prefs";
import { UserMenu, type CurrentUser } from "./user-menu";

export function Topbar({
  user,
  locations,
  currentLocationId,
  onMenuClick,
  onSearchClick,
  density,
  theme,
  simple = false,
}: {
  user: CurrentUser;
  /** Passed through to the user menu, which hosts display preferences. */
  density: Density;
  theme: Theme;
  /** Simple mode: a Home button stands in for the menu the shell no longer has. */
  simple?: boolean;
  /** Active branches. Fewer than two and the switcher is not rendered. */
  locations: SwitcherLocation[];
  currentLocationId: string;
  onMenuClick: () => void;
  onSearchClick: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      {simple ? (
        <Link
          href="/counter"
          aria-label="Home"
          // Icon-only on a phone: with the word, the avatar at the far end of
          // the bar is pushed off a 412px screen.
          className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-[14px] font-bold text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-auto sm:px-3.5"
        >
          <Home className="size-[18px]" aria-hidden />
          <span className="hidden sm:inline">Home</span>
        </Link>
      ) : (
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
      )}

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
        <UserMenu user={user} density={density} theme={theme} simple={simple} />
      </div>
    </header>
  );
}
