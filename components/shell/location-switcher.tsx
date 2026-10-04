"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
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
import { ICONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";

/** MapPin, not a storefront — a storefront is this app's *supplier* glyph. */
const LocationIcon = ICONS.location;

export type SwitcherLocation = { id: string; name: string };

/** Matches lib/location.ts — the "don't filter" sentinel. */
const ALL = "all";

/** What the "everything" choice is called: the shop owner's word, not a filter's. */
export const ALL_SHOPS_LABEL = "All shops";

/**
 * Which shop the app is showing, in the controls row.
 *
 * Rendered ONLY when the shop has two or more active locations, so a
 * single-store shop never sees a control it would have to think about. The
 * choice is a cookie, not a URL parameter: it should survive clicking through
 * to a repair and back, and it should be the same tomorrow morning when the
 * same person opens the same tablet at the same counter.
 */
export function LocationSwitcher({
  locations,
  currentId,
  compact = false,
}: {
  locations: SwitcherLocation[];
  /** "all", or the id of the branch currently in view. */
  currentId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const current = locations.find((location) => location.id === currentId);
  const label = current ? current.name : ALL_SHOPS_LABEL;

  function choose(next: string) {
    if (next === currentId) return;
    const name = next === ALL ? ALL_SHOPS_LABEL.toLowerCase() : locations.find((location) => location.id === next)?.name ?? "that shop";
    startTransition(async () => {
      try {
        await setLocationCookie(next);
        router.refresh();
        // Lists change under the person's hands: say why.
        toast.success(`Showing ${name}`);
      } catch {
        toast.error("Could not switch shop. Try again.");
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
            compact
              ? "flex h-5 max-w-[11rem] items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors"
              : "flex min-h-12 min-w-12 max-w-[8.5rem] items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-[15px] font-semibold text-foreground shadow-xs transition-colors sm:max-w-[14rem]",
            "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            "disabled:opacity-60",
          )}
          aria-label={`Shop: ${label}. Change shop`}
        >
          {compact ? null : <LocationIcon aria-hidden className="size-5 shrink-0" />}
          <span className={cn("truncate", compact ? null : "hidden min-[400px]:inline")}>{label}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel className="text-[14px]">Show work from</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {locations.map((location) => (
          <Choice
            key={location.id}
            label={location.name}
            selected={currentId === location.id}
            onSelect={() => choose(location.id)}
          />
        ))}
        <DropdownMenuSeparator />
        <Choice
          label={ALL_SHOPS_LABEL}
          hint="Every shop together"
          selected={currentId === ALL}
          onSelect={() => choose(ALL)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Choice({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="min-h-12 justify-between gap-3 text-[15px]">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{label}</span>
        {hint ? <span className="truncate text-[13px] font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {selected ? (
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-foreground">
          <Check aria-hidden className="size-4" /> Showing
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}
