"use client";

import * as React from "react";

import { CUSTOMER_SECTIONS_ID } from "./customer-screen";

/**
 * What to do when the customer screen opens: if the address ends in
 * `#sections` (every section tab links there) scroll the tab row to the top of
 * the screen. Returns whether it scrolled. Everything it touches is passed in,
 * so the rule is testable without a browser.
 *
 * The `#sections` stays in the address on purpose: rewriting the URL by hand
 * makes the router redo its own bookkeeping, and a stale hash is harmless (it
 * is only read when the page opens, and it is where a reload would land anyway).
 */
export function revealSections({
  hash,
  target,
}: {
  hash: string;
  /** The element with id `sections`, if the page has one. */
  target: { scrollIntoView: (options: ScrollIntoViewOptions) => void } | null;
}): boolean {
  if (hash !== `#${CUSTOMER_SECTIONS_ID}` || !target) return false;
  target.scrollIntoView({ block: "start" });
  return true;
}

/**
 * Renders nothing. It exists because the header and summary fill a phone's
 * first screen, so tapping a section tab changed the list below the fold and
 * nothing seemed to happen.
 *
 * Why not leave it to the `#sections` link alone: Next scrolls to a hash when
 * the navigation lands, and the route shows its loading skeleton first, which
 * has no `#sections` in it, so that scroll can be spent on the skeleton and
 * never reach the real page. This runs once the real page is on screen.
 */
export function RevealSections() {
  React.useEffect(() => {
    revealSections({
      hash: window.location.hash,
      target: document.getElementById(CUSTOMER_SECTIONS_ID),
    });
  }, []);

  return null;
}
