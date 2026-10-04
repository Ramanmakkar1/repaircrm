import * as React from "react";
import { Phone } from "lucide-react";

import { telHref } from "./customer-facts";

/** The width a card reserves (as RecordCard `trailing`) for the call button that sits over it. */
export function CallButtonSpace() {
  return <span aria-hidden className="block w-12" />;
}

/**
 * A round tap-to-call button for a list card.
 *
 * It is a SIBLING of the card's link, parked over the right edge the card
 * reserved with `CallButtonSpace`: a link inside a link is invalid markup and
 * an ambiguous tap, so the card stays one big link and the phone is its own.
 * Render it inside the card's `relative` list item.
 */
export function CallButton({ phone, who }: { phone: string; who: string }) {
  return (
    <a
      href={telHref(phone)}
      aria-label={`Call ${who} on ${phone}`}
      data-touch-control
      className="absolute right-4 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Phone className="size-5" aria-hidden />
    </a>
  );
}
