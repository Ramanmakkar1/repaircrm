import * as React from "react";
import { cn } from "./cn";

/**
 * A cool-gray sweep rather than a pulse — on a pure-white page a fading block
 * reads as a rendering glitch, a travelling highlight reads as loading.
 * `.rf-skeleton` (globals.css) carries the gradient and respects
 * prefers-reduced-motion by falling back to a flat gray.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rf-skeleton rounded-sm bg-surface-hover", className)}
      {...props}
    />
  );
}
