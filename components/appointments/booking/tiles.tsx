"use client";

import * as React from "react";
import Image from "next/image";
import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";
import type { VisitTile } from "./flow";

/**
 * The boxes the booking is made of. The same family as the check-in's tiles
 * (components/tickets/intake/tiles.tsx), sized for a dialog: every one is a real
 * button with aria-pressed, never shorter than 56px, and a chosen one is
 * outlined and ticked or filled, never colour alone.
 */

const BASE =
  "relative flex min-w-0 select-none items-center rounded-xl border text-left transition-[border-color,background-color,transform] duration-150 " +
  "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** What the visit is for: the photo on its white canvas, the name beside it. */
export function VisitTileButton({
  tile,
  selected,
  onClick,
  className,
}: {
  tile: VisitTile;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        BASE,
        "min-h-[4.5rem] gap-3 rounded-2xl bg-surface p-2 pr-3",
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
        className,
      )}
    >
      <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl bg-white sm:size-16">
        <Image src={tile.photo} alt="" fill sizes="64px" className="object-contain p-1" />
        {selected ? (
          <span
            aria-hidden
            className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm"
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold leading-tight [overflow-wrap:anywhere] sm:text-lg">{tile.label}</span>
        <span className="hidden text-[13px] leading-snug text-muted-foreground sm:block">{tile.detail}</span>
      </span>
    </button>
  );
}

/** Today / Tomorrow / Next week, with the date each one means underneath. Filled when chosen: three share a narrow column, so no room for a tick. */
export function DayTile({
  title,
  detail,
  selected,
  onClick,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        BASE,
        "min-h-16 flex-col justify-center gap-0.5 px-1 py-2 text-center",
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-ring",
      )}
    >
      <span className="whitespace-nowrap text-[15px] font-semibold leading-tight">{title}</span>
      <span className={cn("text-[13px] leading-tight", selected ? "text-accent-foreground/80" : "text-muted-foreground")}>
        {detail}
      </span>
    </button>
  );
}

/** One start time: "9 AM". Filled when chosen. */
export function SlotTile({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        BASE,
        "min-h-14 justify-center px-1 text-center text-base font-semibold leading-tight sm:min-h-12",
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-ring",
      )}
    >
      {label}
    </button>
  );
}

/** A length of time: "30 min". Four fit across a tablet column, so it is filled when chosen, not ticked. */
export function ChoiceChip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        BASE,
        "min-h-12 justify-center px-1.5 text-center text-[15px] font-semibold leading-tight",
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-ring",
      )}
    >
      {children}
    </button>
  );
}
