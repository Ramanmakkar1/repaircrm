"use client";

import * as React from "react";
import Image from "next/image";
import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";
import type { CatalogEntry } from "@/lib/catalog/types";

/**
 * One picture as a button: a white canvas (the pictures are shot on white in every theme), its name under
 * it, and a tick plus the word "Selected" when it is the one in use. Used by the "Is it one of these?" row
 * and by the grid in the "Change picture" window.
 */
export function PictureTile({
  entry,
  selected = false,
  onPick,
  size = "large",
  className,
}: {
  entry: CatalogEntry;
  selected?: boolean;
  onPick: (entry: CatalogEntry) => void;
  /** "small" is the row of suggestions; "large" is the grid. */
  size?: "small" | "large";
  className?: string;
}) {
  const small = size === "small";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `${entry.label}, selected` : `Use ${entry.label}`}
      onClick={() => onPick(entry)}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,transform] duration-150",
        "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
        small ? "min-h-[6.5rem]" : "min-h-[10rem]",
        className,
      )}
    >
      <span className={cn("relative block w-full bg-white", small ? "aspect-[3/2]" : "aspect-[4/3]")}>
        <Image src={entry.image} alt="" fill sizes={small ? "(max-width: 640px) 22vw, 120px" : "(max-width: 640px) 45vw, 200px"} className="object-contain p-1.5" />
      </span>
      <span className={cn("flex flex-col gap-0.5", small ? "px-1.5 pb-2 pt-1.5" : "px-3 pb-3 pt-2")}>
        <span className={cn("font-semibold leading-tight [overflow-wrap:anywhere]", small ? "line-clamp-2 text-[13px]" : "line-clamp-2 text-[15px]")}>{entry.label}</span>
        {selected ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
            Selected
          </span>
        ) : null}
      </span>
      {selected ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
