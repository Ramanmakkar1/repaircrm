"use client";

import * as React from "react";
import { cn } from "@/components/ui/cn";

/** Big ticking wall-clock, updated every second on the client only. */
export function LiveClock({ className }: { className?: string }) {
  // Start `null` so the very first server-rendered markup and the first
  // client render match (no `new Date()` during SSR) — avoids a hydration
  // mismatch warning. It fills in on mount, a frame later.
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
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
