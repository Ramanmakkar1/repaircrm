import * as React from "react";
import { cn } from "./cn";

/**
 * The small rounded fact-tags that sit at the bottom of every card: device
 * type, problem, assigned tech, due date, open-ticket count, balance.
 *
 * Deliberately quieter than a StatusBadge — a card carries one loud colour
 * (its status) and any number of these grey ones, so the eye still lands on
 * the thing that matters.
 */
export function Chip({
  icon: Icon,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[12.5px] font-medium leading-none text-muted-foreground",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A soft, square-ish tile holding a single icon — the visual anchor on stat
 * cards, sidebar nav items and section headers. Colour it by passing tint
 * classes (e.g. `bg-status-ready-bg text-status-ready-fg`).
 */
export function IconChip({
  icon: Icon,
  className,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg" ? "size-12 rounded-lg" : size === "sm" ? "size-8 rounded-sm" : "size-10 rounded-md";
  const glyph = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent-soft text-accent-soft-foreground",
        box,
        className,
      )}
    >
      <Icon className={glyph} strokeWidth={2.25} />
    </span>
  );
}
