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
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
        <input
          type="text"
          placeholder="Search the shop…"
          readOnly
          className="h-11 w-full cursor-text rounded-md border border-border-strong bg-background pl-11 pr-16 text-[15px] text-foreground placeholder:text-faint-foreground outline-none transition-colors focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border-strong bg-surface-hover px-2 py-1 text-[11px] font-semibold text-faint-foreground sm:block">
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
