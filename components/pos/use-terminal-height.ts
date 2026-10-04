"use client";

import * as React from "react";
import { terminalHeight } from "./terminal-logic";

/**
 * Makes the register fill the page area on a wide screen, so the page itself
 * never scrolls and only the product list and the cart's lines do.
 *
 * It measures the shell's scrolling `<main>` (so a taller header, a notch or a
 * different padding all just work) and publishes two CSS variables on the
 * element: `--pos-h` (its height) and `--pos-mb` (a negative margin that cancels
 * the shell's bottom padding, which exists to clear the phone's tab bar).
 * The markup carries fallbacks for the first paint, before this has run.
 *
 * Below `lg` the variables are removed and the register flows as a normal page.
 */
export function useTerminalHeight(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  React.useEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!enabled || !el || !main) return;

    const wide = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (!wide.matches) {
        el.style.removeProperty("--pos-h");
        el.style.removeProperty("--pos-mb");
        return;
      }
      const style = getComputedStyle(main);
      const top = Number.parseFloat(style.paddingTop) || 0;
      const bottom = Number.parseFloat(style.paddingBottom) || 0;
      el.style.setProperty("--pos-h", `${terminalHeight(main.clientHeight, top)}px`);
      el.style.setProperty("--pos-mb", `-${bottom}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(main);
    wide.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", apply);
      el.style.removeProperty("--pos-h");
      el.style.removeProperty("--pos-mb");
    };
  }, [ref, enabled]);
}
