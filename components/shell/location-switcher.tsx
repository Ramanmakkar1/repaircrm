"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Store } from "lucide-react";
import { toast } from "sonner";

import { setLocationCookie } from "@/lib/location-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/components/ui/cn";

export type SwitcherLocation = { id: string; name: string };

/** Matches lib/location.ts — the "don't filter" sentinel. */
const ALL = "all";

/**
 * Which branch the app is showing, in the topbar.
 *
 * Rendered ONLY when the shop has two or more active locations (the topbar
 * decides), so a single-store shop never sees a control it would have to think
 * about. The choice is a cookie, not a URL parameter: it should survive
 * clicking through to a ticket and back, and it should be the same tomorrow
 * morning when the same person opens the same laptop at the same counter.
 */
export function LocationSwitcher({
  locations,
  currentId,
}: {
  locations: SwitcherLocation[];
  /** "all", or the id of the branch currently in view. */
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const current = locations.find((location) => location.id === currentId);
  const label = current ? current.name : "All locations";

  function choose(next: string) {
    if (next === currentId) return;
    startTransition(async () => {
      try {
        await setLocationCookie(next);
        router.refresh();
      } catch {
        toast.error("Could not switch location. Try again.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "flex h-10 max-w-[13rem] shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13.5px] font-semibold text-foreground transition-colors",
            "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            "disabled:opacity-60",
          )}
          aria-label={`Location: ${label}`}
        >
          <Store className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-faint-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Show work from</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <Choice
          label="All locations"
          selected={currentId === ALL}
          onSelect={() => choose(ALL)}
        />
        {locations.map((location) => (
          <Choice
            key={location.id}
            label={location.name}
            selected={currentId === location.id}
            onSelect={() => choose(location.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="justify-between gap-3">
      <span className="truncate">{label}</span>
      {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
    </DropdownMenuItem>
  );
}
