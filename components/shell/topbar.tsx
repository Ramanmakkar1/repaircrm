"use client";

import { Menu, Search } from "lucide-react";
import { NewMenu } from "./new-menu";
import { UserMenu, type CurrentUser } from "./user-menu";

export function Topbar({
  user,
  onMenuClick,
}: {
  user: CurrentUser;
  onMenuClick: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
      >
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>

      {/*
        A gray-50 fill with no border at rest keeps the white topbar from
        growing a second horizontal line; focus swaps it to a white field with
        the same accent edge every other input in the app uses.
      */}
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
        <input
          type="text"
          placeholder="Search the shop…"
          readOnly
          className="h-10 w-full cursor-text rounded-md border border-transparent bg-surface-hover pl-11 pr-16 text-[14.5px] text-foreground placeholder:text-faint-foreground outline-none transition-colors hover:border-border focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/20"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-faint-foreground sm:block">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <NewMenu />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
