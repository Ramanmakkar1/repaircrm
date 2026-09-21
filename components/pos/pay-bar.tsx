"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ICONS } from "@/components/ui/icons";
import { formatCents } from "@/lib/money";
import { METHOD_LABELS, type TenderMethod } from "./types";

/**
 * The total and the two everyday tenders, pinned to the bottom of the screen.
 *
 * The cart is taller than a counter tablet — with three items in it the Cash
 * button sat ~200px below an 820px screen, and under the whole product grid in
 * portrait — so the one thing a sale always ends with needed a scroll to reach.
 * This bar shows only while the cart's own tender buttons are out of view, so
 * there are never two sets of pay buttons on screen at once.
 *
 * `sticky`, not `fixed`: it lives in the page's own column, so it can never sit
 * on top of the sidebar, and it comes to rest under the cart at the end of the
 * scroll instead of covering it.
 */
export function PayBar({
  itemCount,
  dueCents,
  tendersRef,
  onTender,
  disabled,
}: {
  itemCount: number;
  dueCents: number;
  /** The cart's own tender block; the bar hides while this is on screen. */
  tendersRef: React.RefObject<HTMLDivElement | null>;
  onTender: (method: TenderMethod) => void;
  disabled: boolean;
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

  return (
    <div
      role="region"
      aria-label="Take payment"
      // The shell's <main> carries 7rem of bottom padding and `sticky` measures
      // from inside it; the negative offset puts the bar 12px off the real edge.
      className="sticky bottom-[-6.25rem] z-20 -mx-1 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 shadow-lg print:hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-semibold text-muted-foreground">
          {itemCount} {itemCount === 1 ? "item" : "items"} · due now
        </span>
        <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {formatCents(dueCents)}
        </span>
      </div>

      <Button
        onClick={() => onTender("CASH")}
        disabled={disabled}
        className="h-12 px-4 text-[15px] sm:px-6"
      >
        <ICONS.cash />
        {METHOD_LABELS.CASH}
      </Button>
      <Button
        variant="soft"
        onClick={() => onTender("CARD")}
        disabled={disabled}
        className="h-12 px-4 text-[15px] sm:px-6"
      >
        <ICONS.payment />
        {METHOD_LABELS.CARD}
      </Button>
      {/* Cheque, other and store credit stay in the cart — this takes you there. */}
      <Button
        variant="outline"
        onClick={() =>
          tendersRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
        }
        aria-label="More ways to pay"
        title="More ways to pay"
        className="hidden h-12 px-3 sm:inline-flex"
      >
        More
        <ChevronDown />
      </Button>
    </div>
  );
}
