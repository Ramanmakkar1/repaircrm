"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * `j` / `k` down and up a list, `Enter` to open, `Escape` to let go.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS GLOBAL AND NOT PER-PAGE
 * ---------------------------------------------------------------------------
 * Mounted once in the app shell. It finds rows by the `data-row-nav` attribute
 * that `RowLink` already emits, so every list in the app — the ten that exist
 * and the ones nobody has written yet — gets this for free and none of them
 * has to remember to opt in. A per-page hook would be wired into eight of the
 * ten and quietly missing from the two that mattered.
 *
 * ---------------------------------------------------------------------------
 * WHY IT DOES NOT STEAL YOUR TYPING
 * ---------------------------------------------------------------------------
 * A bare-letter shortcut is only safe if it is certain you are not writing.
 * It stands down when:
 *
 *   · focus is in an input, textarea, select or anything contenteditable —
 *     otherwise the search box on every one of these screens would swallow
 *     "j" and jump the list instead of typing it;
 *   · a modifier is held, so ⌘J and browser shortcuts still belong to the
 *     browser;
 *   · a dialog, the ⌘K palette or a menu is open — Radix marks the body
 *     `data-scroll-locked` and points `aria-hidden` at the rest of the page,
 *     and moving a highlight underneath an open dialog is nonsense.
 *
 * The highlight is a real DOM focus on the row, not a piece of React state, so
 * it survives the list re-rendering underneath it and the browser scrolls it
 * into view for us.
 */
export function ListKeyboardNav() {
  const router = useRouter();

  React.useEffect(() => {
    function rows(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-row-nav]"),
      );
    }

    function typingSomewhere(target: EventTarget | null): boolean {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        element.isContentEditable === true
      );
    }

    function overlayOpen(): boolean {
      return (
        document.body.hasAttribute("data-scroll-locked") ||
        document.querySelector("[role='dialog'],[role='menu']") !== null
      );
    }

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingSomewhere(event.target)) return;
      if (overlayOpen()) return;

      const all = rows();
      if (all.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const current = active?.closest?.("[data-row-nav]") as HTMLElement | null;
      const index = current ? all.indexOf(current) : -1;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        // From nowhere, `j` lands on the first row rather than the second.
        focusRow(all[Math.min(index + 1, all.length - 1)]);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        if (index <= 0) return; // let the page scroll up past the top of the list
        event.preventDefault();
        focusRow(all[index - 1]);
        return;
      }
      if (event.key === "Enter" && current) {
        const href = current.getAttribute("data-row-nav");
        if (!href) return;
        event.preventDefault();
        router.push(href);
        return;
      }
      if (event.key === "Escape" && current) {
        current.blur();
      }
    }

    function focusRow(row: HTMLElement | undefined) {
      if (!row) return;
      // `tabIndex` is applied lazily, only to rows this actually visits, so a
      // hundred-row table does not add a hundred tab stops for someone who
      // navigates with Tab and never touches j/k.
      row.tabIndex = -1;
      row.focus({ preventScroll: false });
      row.scrollIntoView({ block: "nearest" });
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
