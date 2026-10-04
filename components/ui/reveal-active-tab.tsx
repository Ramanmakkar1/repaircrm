"use client";

import * as React from "react";

import { scrollLeftToReveal } from "./tab-row-scroll";

/**
 * Wrap a `FilterTabs` row in this and the tab for the view you are in is
 * scrolled into the middle of the row as soon as the page appears.
 *
 * Why it exists: the row scrolls sideways and opens at its start, so a view
 * further along was lit up off the edge of the screen and no tab looked
 * selected. `FilterTabs` is a shared server component, so the fix lives here
 * and does not touch it.
 *
 * It scrolls only that one row (`scrollLeft`), never `scrollIntoView`, which
 * also moves the page and every other scrolling parent. It moves only when the
 * current tab is not fully visible, and only when the current tab changes, so
 * a row the person has scrolled by hand is left alone on a re-render.
 *
 * The wrapper has no box of its own (`display: contents`), so it cannot change
 * the layout of the page it sits in.
 */
export function RevealActiveTab({ children }: { children: React.ReactNode }) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const revealedFor = React.useRef<string | null>(null);

  // Layout effect, not a plain one: the row is moved before the first paint, so
  // nobody sees it start at the left and then jump.
  React.useLayoutEffect(() => {
    const tab = wrapperRef.current?.querySelector<HTMLElement>('[role="navigation"] [aria-current="page"]');
    const row = tab?.closest<HTMLElement>('[role="navigation"]');
    if (!tab || !row) return;

    const key = tab.getAttribute("href") ?? tab.textContent ?? "";
    if (revealedFor.current === key) return;
    revealedFor.current = key;

    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const next = scrollLeftToReveal({
      rowLeft: rowBox.left,
      rowWidth: rowBox.width,
      scrollLeft: row.scrollLeft,
      scrollWidth: row.scrollWidth,
      tabLeft: tabBox.left,
      tabWidth: tabBox.width,
    });
    if (next !== null) row.scrollLeft = next;
  });

  return (
    <div ref={wrapperRef} className="contents">
      {children}
    </div>
  );
}
