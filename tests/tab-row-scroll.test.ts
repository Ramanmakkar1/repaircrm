import { describe, expect, it } from "vitest";

import { scrollLeftToReveal } from "@/components/tickets/tab-row-scroll";

/**
 * The view tabs scroll sideways. These pin down when and where the row moves
 * so the highlighted tab is never left off the edge of the screen.
 */

// A 976px row starting 24px from the left of the screen, holding 1657px of tabs.
const row = { rowLeft: 24, rowWidth: 976, scrollWidth: 1657 };

describe("scrollLeftToReveal", () => {
  it("leaves the row alone when the current tab is already fully visible", () => {
    // "Open jobs" first in the row.
    expect(scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 24, tabWidth: 120 })).toBeNull();
    // A tab in the middle.
    expect(scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 500, tabWidth: 140 })).toBeNull();
    // Flush against the right edge still counts as visible.
    expect(scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 1000 - 140, tabWidth: 140 })).toBeNull();
  });

  it("treats a fraction of a pixel past the edge as visible (the last tab, scrolled to the end)", () => {
    // Dashboard on a 390px phone: the last tab's right edge measured 374.42 in a row ending at 374.
    const phone = { rowLeft: 16, rowWidth: 358, scrollWidth: 656 };
    expect(scrollLeftToReveal({ ...phone, scrollLeft: 298, tabLeft: 210.52, tabWidth: 163.9 })).toBeNull();
    // A whole extra pixel or more is cut off, so it does move.
    expect(scrollLeftToReveal({ ...phone, scrollLeft: 200, tabLeft: 308.5, tabWidth: 163.9 })).not.toBeNull();
  });

  it("brings a tab that is off the right edge to the middle of the row", () => {
    // /tickets?status=Resolved at 1024: the lit tab was at x=1440, 132px wide.
    const next = scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 1440, tabWidth: 132 });
    expect(next).not.toBeNull();
    // After scrolling by `next` the tab sits 1440 - next from the screen's left edge.
    const tabLeftAfter = 1440 - (next as number);
    expect(tabLeftAfter).toBeGreaterThanOrEqual(24);
    expect(tabLeftAfter + 132).toBeLessThanOrEqual(24 + 976);
    // This row only has 681px left to scroll, so it stops at the end.
    expect(next).toBe(1657 - 976);
  });

  it("puts the tab exactly in the middle when the row has room to do so", () => {
    const wide = { rowLeft: 24, rowWidth: 976, scrollWidth: 3000 };
    const next = scrollLeftToReveal({ ...wide, scrollLeft: 0, tabLeft: 1440, tabWidth: 132 }) as number;
    expect(1440 - next + 66).toBeCloseTo(24 + 488, 0);
  });

  it("reveals a tab that is only partly cut off at the right", () => {
    const next = scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 900, tabWidth: 140 });
    expect(next).not.toBeNull();
    expect(900 - (next as number)).toBeGreaterThanOrEqual(24);
  });

  it("brings a tab that is scrolled off the left edge back", () => {
    // Row is scrolled to the end; the first tab is now off to the left.
    const next = scrollLeftToReveal({ ...row, scrollLeft: 681, tabLeft: 24 - 681, tabWidth: 120 });
    // Cannot scroll past the start, so the first tab lands at 0.
    expect(next).toBe(0);
  });

  it("never scrolls past the end or before the start", () => {
    // The very last tab: centring would want to go past the end of the content.
    const last = scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 1500, tabWidth: 157 });
    expect(last).toBe(1657 - 976);
    const first = scrollLeftToReveal({ ...row, scrollLeft: 300, tabLeft: -250, tabWidth: 120 });
    expect(first).toBe(0);
  });

  it("returns whole pixels", () => {
    const next = scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 1200.4, tabWidth: 131.27 });
    expect(Number.isInteger(next)).toBe(true);
  });

  it("does nothing when the row or the tab has no size yet (hidden, not laid out)", () => {
    expect(scrollLeftToReveal({ ...row, rowWidth: 0, scrollLeft: 0, tabLeft: 1440, tabWidth: 132 })).toBeNull();
    expect(scrollLeftToReveal({ ...row, scrollLeft: 0, tabLeft: 1440, tabWidth: 0 })).toBeNull();
  });

  it("does nothing when the tabs fit and cannot scroll", () => {
    const next = scrollLeftToReveal({ rowLeft: 24, rowWidth: 976, scrollWidth: 976, scrollLeft: 0, tabLeft: 1440, tabWidth: 132 });
    // maxScroll is 0, so the answer is 0: a no-op scroll rather than a negative or huge value.
    expect(next).toBe(0);
  });
});
