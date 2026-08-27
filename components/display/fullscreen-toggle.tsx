"use client";

import * as React from "react";
import { Maximize, Minimize } from "lucide-react";

/** Puts (or takes) the whole page into the browser's Fullscreen API — the
 * one-tap affordance for mounting this board on a shop-floor TV/kiosk. */
export function FullscreenToggle({ className }: { className?: string }) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied (no user gesture, unsupported, etc.) —
        // nothing useful to do besides leaving the board as-is.
      });
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFullscreen ? (
        <Minimize className="size-4" aria-hidden />
      ) : (
        <Maximize className="size-4" aria-hidden />
      )}
      <span className="sr-only">
        {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      </span>
    </button>
  );
}
