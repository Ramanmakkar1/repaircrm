"use client";

import * as React from "react";
import { cn } from "@/components/ui/cn";

/** Big ticking wall-clock, updated every second on the client only. */
export function LiveClock({ className }: { className?: string }) {
  // Start `null` so the very first server-rendered markup and the first
  // client render match (no `new Date()` during SSR) — avoids a hydration
  // mismatch warning. It fills in on mount, a frame later.
  const [now, setNow] = React.useState<Date | null>(null);

  // The clock is an external system, so every reading comes out of one of its
  // callbacks: the first from the next painted frame, the rest from the
  // interval. Stamping the state straight from the effect body would only
  // cascade an extra render to gain a frame nobody can see.
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const frame = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, []);

  return (
    <span className={cn("tabular-nums", className)} suppressHydrationWarning>
      {now ? formatClockTime(now) : "--:--:--"}
    </span>
  );
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
