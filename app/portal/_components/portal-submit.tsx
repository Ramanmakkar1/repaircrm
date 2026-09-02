"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/components/ui/cn";

/**
 * The portal's own submit button.
 *
 * Not `components/ui/submit-button` on purpose: the portal is a separate,
 * chunkier surface (48px targets, 12px corners) for someone on a phone in a
 * hallway, and borrowing the app's 40px button here would be the only control
 * on the page that did not match. What it does share is the rule — a form in
 * flight disables its button and says so, so a second impatient tap cannot mail
 * a second sign-in link.
 */
export function PortalSubmit({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
