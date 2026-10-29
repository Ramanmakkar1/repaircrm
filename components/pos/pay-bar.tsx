"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ICONS } from "@/components/ui/icons";
import { formatCents } from "@/lib/money";
import type { TenderMethod } from "./types";

/**
 * "3 items · $245.45 · Pay", pinned to the bottom of a phone's screen.
 *
 * On a phone the cart sits under the whole product list, so the total and the
 * Cash/Card row were a long scroll away. This bar shows while the cart's own
 * tender row is out of view (never two sets of pay buttons at once); Pay
 * brings the cart's Cash / Card / More row up, with the lines and the total
 * right above it, and puts the focus on Cash.
 *
 * From `md` the register is two columns and the cart is always in view, so
 * the register hides this bar there (`md:hidden`).
 *
 * `sticky`, not `fixed`: it lives in the page's own column. It rests 12px off
 * the bottom of the scrolling <main> (an offset past the bottom edge, as
 * before, parked it below the screen where nobody could see it).
 */
export function PayBar({
  itemCount,
  dueCents,
  tendersRef,
  disabled,
  className,
}: {
  itemCount: number;
  dueCents: number;
  /** The cart's own tender block; the bar hides while this is on screen. */
  tendersRef: React.RefObject<HTMLDivElement | null>;
  /** Kept for callers; the bar now hands over to the cart's own tender row. */
  onTender?: (method: TenderMethod) => void;
  disabled: boolean;
  /** For example `md:hidden`, where the cart is its own column. */
  className?: string;
}) {
  const [tendersVisible, setTendersVisible] = React.useState(false);

  React.useEffect(() => {
    const target = tendersRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setTendersVisible(entry.isIntersecting),
      // "On screen" means the Cash/Card row is, not a sliver of the block.
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tendersRef]);

  if (itemCount === 0 || tendersVisible) return null;

  const pay = () => {
    const row = tendersRef.current;
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "end" });
    row.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  };

  return (
    <div
      role="region"
      aria-label="Take payment"
      className={cn(
        "sticky bottom-3 z-20 -mx-1 flex items-center gap-3 rounded-xl border border-border-strong bg-surface py-2 pl-4 pr-2 shadow-lg print:hidden",
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 items-baseline gap-2 text-[15px] font-semibold text-muted-foreground">
        <span className="shrink-0">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate text-xl font-bold tabular-nums tracking-tight text-foreground">
          {formatCents(dueCents)}
        </span>
      </p>
      <Button onClick={pay} disabled={disabled} className="h-12 shrink-0 px-6 text-base">
        <ICONS.payment />
        Pay
      </Button>
    </div>
  );
}
