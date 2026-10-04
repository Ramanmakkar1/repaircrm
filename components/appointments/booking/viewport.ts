"use client";

import * as React from "react";

/** The part of the screen a phone's keyboard leaves free: where the sheet should sit. */
export type KeyboardBox = { top: number; height: number };

/**
 * `null` while there is no keyboard. Browser bars slide in and out by a few
 * dozen pixels all the time; only a gap well over 100px is a keyboard, so the
 * sheet is left alone (full height) the rest of the time.
 */
export function keyboardBox(
  layoutHeight: number,
  visual: { height: number; offsetTop: number },
): KeyboardBox | null {
  if (layoutHeight - visual.height < 120) return null;
  return { top: Math.max(0, Math.round(visual.offsetTop)), height: Math.round(visual.height) };
}

/**
 * Follows the visual viewport, so a full-height phone sheet shrinks to what the
 * keyboard leaves and its pinned button stays above it. Phones lay a fixed
 * element out against the whole screen and slide the keyboard over it; only the
 * visual viewport knows where the keyboard starts.
 */
export function useKeyboardBox(active: boolean): KeyboardBox | null {
  const [box, setBox] = React.useState<KeyboardBox | null>(null);

  React.useEffect(() => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !viewport) return;
    const update = () => {
      const next = keyboardBox(window.innerHeight, viewport);
      setBox((current) =>
        current?.top === next?.top && current?.height === next?.height ? current : next,
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);

  return box;
}
