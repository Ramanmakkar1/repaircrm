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
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-md bg-surface-hover px-2 py-[3px] text-[12px] font-medium leading-none text-muted-foreground",
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
 * A small square tile holding a single icon — the anchor on section headers
 * and list rows. Neutral unless you say otherwise: colour it by passing tint
 * classes (e.g. `bg-status-ready-bg text-status-ready-fg`) on the rare card
 * that is genuinely *about* a status.
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
    size === "lg" ? "size-10 rounded-md" : size === "sm" ? "size-7 rounded-sm" : "size-8 rounded-md";
  const glyph = size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      /*
       * Neutral by default, not indigo. Nineteen call sites paint one of
       * these, and when the default was accent-tinted every screen carrying a
       * few of them got a scatter of purple squares that meant nothing in
       * particular. Callers that pass their own tint — a status colour on a
       * card that is genuinely about that status — still win, because their
       * classes land after these.
       */
      className={cn(
        "flex shrink-0 items-center justify-center bg-surface-hover text-muted-foreground",
        box,
        className,
      )}
    >
      <Icon className={glyph} strokeWidth={2.25} />
    </span>
  );
}
