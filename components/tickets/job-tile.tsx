import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * One quick-action tile: a card you can press anywhere, with a picture-sized
 * icon in a soft square and one plain word. 88px tall at least; it takes the
 * width of its grid cell and the word wraps, so every tile is the same size
 * whatever the label.
 */
export const TILE_CLASS = cn(
  "flex min-h-[5.5rem] min-w-0 flex-col items-center justify-start gap-1.5 rounded-2xl border border-border bg-surface px-2 py-3 text-center",
  "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function TileFace({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-6" strokeWidth={1.8} />
      </span>
      <span className="text-[13.5px] font-semibold leading-tight text-foreground">{label}</span>
    </>
  );
}
