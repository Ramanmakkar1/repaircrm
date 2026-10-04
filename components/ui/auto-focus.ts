"use client";

import * as React from "react";

/**
 * Focus a field on arrival only where that helps.
 *
 * On a computer (a mouse or trackpad: a "fine" pointer) jumping straight into
 * the first field saves a click. On a tablet or phone the same focus opens the
 * on-screen keyboard before the person has chosen anything, and the keyboard
 * covers the picture choices below the field (the New repair customer search
 * was the worst case). So: focus with a fine pointer, leave it alone with a
 * finger, and the person taps the field when they want to type.
 *
 * Use instead of `autoFocus`:
 *
 *   const ref = useFineAutoFocus<HTMLInputElement>();
 *   <input ref={ref} ... />
 *
 * or, where a ref is awkward (a Radix `onOpenAutoFocus`), check
 * `prefersFinePointer()` first. Documented in docs/touch-style-guide.md.
 */

/** True on a device whose main pointer is a mouse or trackpad. False on the server. */
export function prefersFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

/** A ref that focuses its element once, on mount, but only with a fine pointer. */
export function useFineAutoFocus<T extends HTMLElement>(enabled = true): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    if (enabled && prefersFinePointer()) ref.current?.focus({ preventScroll: true });
  }, [enabled]);
  return ref;
}

/** Props for a search field: the keyboard's return key says Search, and the field clears with its own x. */
export const SEARCH_INPUT_PROPS = {
  type: "search",
  enterKeyHint: "search",
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;
