"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim bar across the top while a tapped link loads, so a tap always shows
 * that something happened, even when the next screen takes a moment.
 *
 * It listens for taps on ordinary in-app links (not new tabs, downloads or
 * links to other sites) and stops when the address changes. A link to the
 * screen you are already on does nothing, so it never starts. If the
 * navigation is abandoned the bar gives up after a few seconds.
 */
export function isInAppNavigation(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  anchor: Pick<HTMLAnchorElement, "href" | "target" | "hasAttribute">,
  here: string,
  origin: string,
): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return false;
  let next: URL;
  try {
    next = new URL(anchor.href, origin);
  } catch {
    return false;
  }
  if (next.origin !== origin) return false;
  const current = new URL(here, origin);
  // Same screen and same filters (a #section link, or the current tab again): nothing loads.
  return next.pathname !== current.pathname || next.search !== current.search;
}

export function NavigationProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const query = search?.toString() ?? "";
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!isInAppNavigation(event, anchor, window.location.href, window.location.origin)) return;
      window.clearTimeout(timer.current);
      setState("loading");
      // A link whose own handler cancels it (it opens a dialog instead) never changes the address.
      timer.current = window.setTimeout(() => setState("idle"), 8_000);
    }
    // Capture phase: Next's Link cancels the browser's own navigation in its handler,
    // so by the bubble phase every in-app link would look cancelled.
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  // The address changed: the next screen is on its way in.
  React.useEffect(() => {
    window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a navigation that already happened
    setState((current) => (current === "loading" ? "done" : current));
    timer.current = window.setTimeout(() => setState("idle"), 300);
    return () => window.clearTimeout(timer.current);
  }, [path, query]);

  return (
    <div
      aria-hidden
      data-state={state}
      className="rf-nav-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] print:hidden"
    >
      <span className="block h-full bg-ring" />
    </div>
  );
}
