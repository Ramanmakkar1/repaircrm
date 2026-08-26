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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground md:hidden"
      >
        <Menu className="size-4" />
        <span className="sr-only">Open menu</span>
      </button>

      <div className="relative max-w-sm flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint-foreground" />
        <input
          type="text"
          placeholder="Search…"
          readOnly
          className="h-8 w-full cursor-text rounded-md border border-border-strong bg-surface pl-8 pr-12 text-[13px] text-foreground placeholder:text-faint-foreground outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border-strong bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-faint-foreground">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NewMenu />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
