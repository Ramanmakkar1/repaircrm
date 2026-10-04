"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InitialsVisual } from "@/components/ui/record-card";
import { cn } from "@/components/ui/cn";
import type { HubLine } from "./hub-status";
import type { SettingsGroup, SettingsPanel } from "./settings-panels";

/**
 * Settings in Easy mode opens like Home: every area at once, as picture tiles
 * under five plain headings (Shop, People, Money, Connections, System). One tap
 * opens an area; "All settings" comes back. Nothing is hidden behind a second
 * row that only appears after a first choice.
 *
 * Tiles are links to `/settings?tab=…`, so a long-press opens one in a new tab
 * and every old `?tab=` bookmark still lands on its panel. The settings shell
 * takes a plain click and swaps the panel on the client (no server round trip).
 */
export function SettingsHub({
  groups,
  lines,
  me,
}: {
  groups: SettingsGroup[];
  lines: Record<string, HubLine>;
  /** The signed-in person's name: My profile shows their initials, not a stock photo. */
  me?: string;
}) {
  return (
    <nav aria-label="Settings areas" className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.label || "all"} aria-labelledby={group.label ? `hub-${group.label}` : undefined} className="flex flex-col gap-3">
          {group.label ? (
            <h2 id={`hub-${group.label}`} className="text-lg font-semibold leading-tight text-foreground">
              {group.label}
            </h2>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((panel) => (
              <li key={panel.value} className="min-w-0">
                <HubTile panel={panel} line={lines[panel.value]} me={panel.value === "profile" ? me : undefined} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function HubTile({ panel, line, me }: { panel: SettingsPanel; line?: HubLine; me?: string }) {
  return (
    <Link
      href={`/settings?tab=${panel.value}`}
      scroll={false}
      data-hub-tile={panel.value}
      className={cn(
        "group flex h-full min-h-24 items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 pr-3.5",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {me ? (
        <InitialsVisual name={me} className="size-[4.5rem] text-2xl sm:size-[4.5rem] sm:text-2xl" />
      ) : (
        <span className="relative block size-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={panel.photo} alt="" fill sizes="72px" className="object-contain p-1.5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[17px] font-semibold leading-tight text-foreground">{panel.label}</span>
        <span className="line-clamp-2 text-[14px] leading-snug text-muted-foreground">{line?.detail ?? panel.blurb}</span>
        {line?.state ? <StatusPill tone={line.state.tone} label={line.state.label} className="mt-0.5 text-[13px]" /> : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/**
 * The top of an open area: a big "All settings" back to the hub, the area's
 * name and its one line. The shell's own Back still goes where it always did.
 */
export function PanelHeading({
  panel,
  onBack,
}: {
  panel: SettingsPanel;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <Button asChild variant="outline" className="h-12 w-fit shrink-0 px-4 text-[15px]">
        <Link
          href="/settings"
          scroll={false}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            onBack();
          }}
        >
          <ArrowLeft aria-hidden /> All settings
        </Link>
      </Button>
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={panel.photo} alt="" fill sizes="56px" className="object-contain p-1" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-foreground">{panel.label}</h1>
          <p className="text-[15px] leading-snug text-muted-foreground">{panel.blurb}</p>
        </div>
      </div>
    </div>
  );
}
