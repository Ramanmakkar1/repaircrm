"use client";

import * as React from "react";

/**
 * Focus a box on arrival only where a keyboard is the way in.
 *
 * On a counter PC (a mouse: a fine pointer) the cursor waiting in the search
 * box saves a click. On a touch tablet or a phone the same focus pops the
 * on-screen keyboard up over the picture choices the person came to tap, so
 * there it waits for a tap instead.
 *
 * A local stand-in until the shell's shared helper lands; same contract.
 */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

/** A ref that focuses its element once, when it mounts, on a fine pointer only. */
export function useFinePointerAutoFocus<T extends HTMLElement>(): React.RefCallback<T> {
  return React.useCallback((node: T | null) => {
    if (node && hasFinePointer()) node.focus({ preventScroll: true });
  }, []);
}
