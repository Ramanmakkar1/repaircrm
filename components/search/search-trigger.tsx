"use client";

import { ICONS } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Search = ICONS.search;

/**
 * The topbar's search affordance. It looks like the field it replaced but is a
 * real button, because typing never happens here — every keystroke belongs to
 * the ⌘K palette, which owns focus, history and keyboard navigation.
 *
 * Phones get the icon on its own: a 320px topbar has no room for a field, and
 * the palette opens full-screen there anyway.
 */
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      {/* phone: icon only */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:hidden"
          >
            <Search className="size-5" />
            <span className="sr-only">Search the shop</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Search the shop</TooltipContent>
      </Tooltip>

      {/* tablet and up: a field-shaped button, ⌘K spelled out on the right */}
      <button
        type="button"
        onClick={onOpen}
        aria-keyshortcuts="Meta+K Control+K"
        className="relative hidden h-10 max-w-md flex-1 items-center rounded-md border border-transparent bg-surface-hover pl-11 pr-16 text-left text-[14.5px] text-faint-foreground transition-colors hover:border-border focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 sm:flex"
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
        <span className="truncate">Search the shop…</span>
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-faint-foreground">
          ⌘K
        </kbd>
      </button>
    </>
  );
}
