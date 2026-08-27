"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatClockTime } from "./live-clock";

const REFRESH_MS = 30_000;

/**
 * Keeps the board's server-rendered ticket data fresh without a manual
 * reload: calls `router.refresh()` every 30s so the RSC tree re-fetches from
 * the DB, and shows a subtle "Updated HH:MM:SS" stamp for the last refresh.
 *
 * Pauses while the tab/TV input is hidden (`visibilitychange`) so a wall TV
 * that's switched to another HDMI input doesn't keep hammering the DB, and
 * immediately refreshes the moment it becomes visible again.
 */
export function AutoRefresh({ className }: { className?: string }) {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setLastRefreshed(new Date());

    const refresh = () => {
      router.refresh();
      setLastRefreshed(new Date());
    };

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id !== null) return;
      id = setInterval(refresh, REFRESH_MS);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return (
    <span className={className} suppressHydrationWarning>
      {lastRefreshed ? `Updated ${formatClockTime(lastRefreshed)}` : "Updated —"}
    </span>
  );
}
