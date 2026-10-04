"use client";

import * as React from "react";
import { Maximize, Minimize } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * Puts the BOARD (the element with `targetId`) into the browser's Fullscreen
 * API, so the TV shows the board alone, without the app's top bar. A 48px
 * button with its words on it: "Full screen" / "Exit full screen".
 */
export function FullscreenToggle({ targetId, className }: { targetId: string; className?: string }) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const target = document.getElementById(targetId) ?? document.documentElement;
    void target.requestFullscreen().catch(() => {
      // Fullscreen can be denied (no user gesture, unsupported, etc.) —
      // nothing useful to do besides leaving the board as-is.
    });
  }, [targetId]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFullscreen}
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold transition-colors",
        "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isFullscreen ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
      {isFullscreen ? "Exit full screen" : "Full screen"}
    </button>
  );
}
