/**
 * Touch sizes for the pages customers use (portal, check-in, the shop page,
 * sign-in, error pages).
 *
 * The signed-in app lifts every control to 48px through `data-touch-workspace`
 * in Easy mode. Public pages have no workspace around them, so they ask for the
 * size directly: pass one of these to the shared `Button` (size "lg") rather
 * than hand-rolling a button.
 */

/** The everyday big button: 48px tall, full width on a phone. */
export const BIG_BUTTON = "h-12 min-h-12 w-full rounded-xl px-5 text-[15px] sm:w-auto";

/** The one main action of a screen: 56px tall, always full width. */
export const HUGE_BUTTON = "h-14 min-h-14 w-full rounded-xl px-6 text-base";

/** A 48px text link that still reads as a link (back, print, change). */
export const TOUCH_LINK =
  "inline-flex min-h-12 items-center gap-2 rounded-xl px-1 text-[15px] font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A 48px text field at 16px type (no zoom-on-focus on iOS). */
export const BIG_INPUT = "h-12 rounded-xl px-4 text-base";
