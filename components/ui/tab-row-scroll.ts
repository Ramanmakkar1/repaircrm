/**
 * Where a scrolling row of tabs should be scrolled so the current tab is seen.
 *
 * The view tabs (Open jobs, Ready for pickup, ... Resolved) are one row that
 * scrolls sideways when it is longer than the screen. The page opens with that
 * row at its start, so a view near the end ("Resolved", "Waiting on Customer",
 * or any saved view) was highlighted somewhere off the edge: nothing looked
 * selected and you could not tell which list you were in.
 *
 * This is the whole decision, kept free of the DOM so it can be tested:
 * everything is measured in the same viewport coordinates
 * (`getBoundingClientRect().left` and `.width`).
 */
export interface TabRowMeasure {
  /** Left edge of the scrolling row on screen, and how wide it is. */
  rowLeft: number;
  rowWidth: number;
  /** How far the row is scrolled now, and how wide all its tabs are together. */
  scrollLeft: number;
  scrollWidth: number;
  /** Left edge of the current tab on screen, and how wide it is. */
  tabLeft: number;
  tabWidth: number;
}

const SLACK = 1;

/**
 * The new `scrollLeft` that puts the current tab in the middle of the row, or
 * `null` when it is already fully on screen and nothing should move. Leaving a
 * visible tab alone matters: a row the person scrolled themselves, or a tab
 * near the start, must not jump just because the page rendered again.
 */
export function scrollLeftToReveal(measure: TabRowMeasure): number | null {
  const { rowLeft, rowWidth, scrollLeft, scrollWidth, tabLeft, tabWidth } = measure;
  if (!(rowWidth > 0) || !(tabWidth > 0)) return null;

  // A pixel of slack: a tab at the very end of the row measures a fraction of a
  // pixel past the edge (scrollWidth is a whole number, tab widths are not).
  const fullyVisible = tabLeft >= rowLeft - SLACK && tabLeft + tabWidth <= rowLeft + rowWidth + SLACK;
  if (fullyVisible) return null;

  const centreOffset = tabLeft + tabWidth / 2 - (rowLeft + rowWidth / 2);
  const maxScroll = Math.max(0, scrollWidth - rowWidth);
  const target = Math.min(maxScroll, Math.max(0, scrollLeft + centreOffset));
  return Math.round(target);
}
