"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  created: "Customer created.",
  updated: "Customer updated.",
  // Stripe redirects back here after the hosted card-setup page. The card
  // itself lands via the webhook a moment later — see CardOnFileCard.
  "card-saved": "Card saved. It will appear here in a moment.",
};

/** Flashes that are not good news. */
const WARNINGS: Record<string, string> = {
  "card-canceled": "No card was saved.",
};

/**
 * Fires the one-shot toast a redirecting server action asked for
 * (`?flash=created`) and strips the param so a refresh doesn't repeat it.
 * `tab` is the section the Easy screen is showing: it is kept in the URL, so
 * returning from Stripe's card page leaves you on Details, not back on Repairs.
 */
export function FlashToast({ flash, tab }: { flash?: string; tab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current || !flash) return;
    const message = MESSAGES[flash];
    const warning = WARNINGS[flash];
    if (!message && !warning) return;
    fired.current = true;
    if (message) toast.success(message);
    else toast.message(warning);
    router.replace(tab ? `${pathname}?tab=${tab}` : pathname, { scroll: false });
  }, [flash, pathname, router, tab]);

  return null;
}
