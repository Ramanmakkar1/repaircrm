"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "./cn";

/**
 * An object's identifier, in monospace, click to copy.
 *
 * Stripe's dashboard treats every record as an addressable thing whose id you
 * can lift out and paste into a search box, a support message or a webhook
 * log. That is a surprisingly large part of why it feels trustworthy: the
 * screen is not the only handle on the object.
 *
 * The shop version of that is a ticket number read out over the phone, an
 * invoice number pasted into an email, a Stripe payment id chased through a
 * refund. So this renders a real id, not a decorative one — and never
 * truncates it, because the whole point is that what you copy is what you saw.
 *
 * Falls back silently when the clipboard API is unavailable (an insecure
 * origin, an old in-app browser): the id stays selectable text, which is what
 * anyone would have done by hand anyway.
 */
export function CopyableId({
  value,
  label,
  className,
}: {
  value: string;
  /** What is being copied, for screen readers. Defaults to "id". */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  // A ref, not a plain variable: the timer has to survive re-renders so the
  // unmount cleanup can actually find it.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // no clipboard (insecure origin, locked-down browser) — the text is
      // still there to select by hand, so say nothing rather than throw a
      // toast at someone who did not ask for one.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${label ?? "id"}` : `Copy ${label ?? "id"}`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 -mx-1 text-[12.5px] transition-colors",
        "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <span className="rf-id text-muted-foreground">{value}</span>
      {copied ? (
        <Check aria-hidden className="size-3.5 shrink-0 text-status-resolved" />
      ) : (
        <Copy
          aria-hidden
          className="size-3.5 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
    </button>
  );
}
