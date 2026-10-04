/**
 * The look of the quick tiles under the big button on a bill (Easy mode).
 *
 * A plain string in its own module, not an export of a client component: the
 * server page, the send dialog and the action menus all need the same classes,
 * and a constant exported from a "use client" file is not a value a server
 * component can read.
 *
 * Tiles are an icon over one word, 64px tall, and they share a row by growing
 * from a 96px basis, so any number of them fills its lines evenly (three, then
 * the rest stretched) instead of leaving a hole at the end of the last one.
 */
export const TILE_CLASS =
  // Icon and word start at the same height in every tile (justify-start), so a
  // two-word label that wraps ("Send receipt") never pushes its icon out of
  // line with its neighbours'; the words wrap evenly rather than leaving one.
  "flex min-h-16 flex-1 basis-[6rem] flex-col items-center justify-start gap-1 rounded-xl border border-border-strong bg-surface px-1.5 pb-2 pt-3 text-center text-[14px] font-semibold leading-tight text-foreground [text-wrap:balance] " +
  "transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0";

/**
 * Sizes the trigger of a dialog the page does not own (the take-payment dialog
 * only takes a `size`) to the one big button: 56px, full width, 18px words.
 * Selector based on purpose, the same idea as `ActionSlot` in document-header.
 */
export const BIG_BUTTON_SLOT =
  "w-full [&_[data-slot=button]]:h-14 [&_[data-slot=button]]:w-full [&_[data-slot=button]]:px-6 [&_[data-slot=button]]:text-lg [&_svg]:size-5";
