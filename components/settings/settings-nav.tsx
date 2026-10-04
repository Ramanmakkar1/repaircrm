"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/components/ui/cn";
import { groupOf, type SettingsGroup } from "./settings-panels";

/**
 * Settings navigation for Easy mode: the same big pills as `FilterTabs`.
 *
 * Why not `FilterTabs` itself: its tabs are links, and a link here would be a
 * full server render of Settings (fourteen queries and two Stripe round trips)
 * on every tap. Settings loads once and swaps panels on the client, so these
 * are buttons that borrow its look, class for class.
 *
 * Two short rows instead of one row of fourteen: the first picks an area
 * (Shop, People, Money...), the second picks a screen inside it. Never more
 * than five choices at a time, and the current one is always on screen.
 */
const PILL =
  "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PILL_IDLE =
  "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground";
const ROW = "-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1";

/** Brings the current pill into view in a row that scrolls sideways on a phone. */
function useRevealActive(row: React.RefObject<HTMLElement | null>, key: string) {
  React.useEffect(() => {
    const active = row.current?.querySelector<HTMLElement>("[data-active=true]");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [row, key]);
}

export function SettingsPillNav({
  groups,
  value,
  onSelect,
}: {
  groups: SettingsGroup[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const areaRow = React.useRef<HTMLElement>(null);
  const screenRow = React.useRef<HTMLDivElement>(null);

  const active = groupOf(groups, value);
  // With no headings (a technician's three screens) there is only the one row.
  const showAreas = groups.length > 1 || groups[0].label !== "";

  useRevealActive(areaRow, active.label);
  useRevealActive(screenRow, value);

  return (
    <div className="flex flex-col gap-2">
      {showAreas ? (
        <nav ref={areaRow} aria-label="Settings areas" className={ROW}>
          {groups.map((group) => {
            const current = group === active;
            return (
              <button
                key={group.label}
                type="button"
                data-active={current}
                aria-current={current ? "true" : undefined}
                // Opens the area on its first screen; the screens row below
                // then offers the rest.
                onClick={() => onSelect(group.items[0].value)}
                className={cn(
                  PILL,
                  current
                    ? "border-accent bg-accent text-accent-foreground"
                    : PILL_IDLE,
                )}
              >
                {group.label}
              </button>
            );
          })}
        </nav>
      ) : null}

      <TabsPrimitive.List
        ref={screenRow}
        aria-label={showAreas ? `${active.label} settings` : "Settings"}
        className={ROW}
      >
        {active.items.map((panel) => (
          <TabsPrimitive.Trigger
            key={panel.value}
            value={panel.value}
            data-active={panel.value === value}
            className={cn(
              PILL,
              PILL_IDLE,
              "data-[state=active]:border-accent-soft-foreground/50 data-[state=active]:bg-accent-soft data-[state=active]:text-accent-soft-foreground",
            )}
          >
            {panel.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </div>
  );
}
