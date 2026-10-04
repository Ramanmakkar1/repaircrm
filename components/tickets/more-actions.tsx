"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * "More": the secondary actions of a screen behind one big button.
 *
 * It is a small popover rather than a Radix menu on purpose. Several of the
 * actions inside are dialogs (Edit, Make invoice, Delete) that live inside the
 * button that opens them; a menu that unmounts its items when it closes would
 * take an open dialog down with it. Here the panel is only hidden, never
 * removed, so a dialog opened from it keeps its state while the panel closes.
 *
 * Closes on Escape, on a tap anywhere outside, and when an action inside is
 * chosen.
 */
export function MoreActions({
  children,
  label = "More",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full px-5 text-base sm:w-auto [&_svg]:size-5"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden />
        {label}
      </Button>
      <div
        id={panelId}
        // Choosing an action closes the panel; the dialog it opens is portaled
        // out and stays up because this subtree is only hidden.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a")) setOpen(false);
        }}
        className={cn(
          "absolute right-0 top-full z-30 mt-2 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-lg",
          "[&_a]:w-full [&_a]:justify-start [&_button]:w-full [&_button]:justify-start",
          !open && "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
