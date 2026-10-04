import * as React from "react";

import { RecordCard } from "@/components/ui/record-card";
import { cn } from "@/components/ui/cn";

/**
 * A RecordCard with a row of controls under it.
 *
 * The card is one big link, and a link may not contain buttons, so anything
 * you can do to a record without opening it (add one to the shelf, edit a
 * supplier) sits in a SIBLING strip. Both live inside one rounded box, so to
 * the eye it is one card with a footer, and to a finger there are two clearly
 * separate targets: the card opens the record, the footer buttons act on it.
 *
 * Give each control `FOOTER_ACTION`: they share the strip equally and are never
 * smaller than a thumb (48px).
 */
export function RecordWithActions({
  actions,
  className,
  ...card
}: React.ComponentProps<typeof RecordCard> & {
  /** Buttons for the footer strip. They are laid out side by side, sharing the width. */
  actions: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        "transition-colors duration-150 hover:border-ring focus-within:border-ring",
        className,
      )}
    >
      <RecordCard
        {...card}
        // The box owns the border and corners; the ring turns inward so the box does not clip it.
        className="min-h-28 flex-1 rounded-none border-0 focus-visible:ring-inset"
      />
      <div className="flex divide-x divide-border border-t border-border">{actions}</div>
    </li>
  );
}

/** The class every footer control shares: full strip height, no corners of its own, half the width each. */
export const FOOTER_ACTION = "h-12 flex-1 rounded-none text-sm";
