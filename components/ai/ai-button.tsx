"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * The one visual signature for "this button asks a model for something".
 *
 * Deliberately the `soft` variant and never the solid accent: on a ticket the
 * loud button is the one that posts an update to a customer. An AI draft is a
 * suggestion nobody has approved yet, so it reads as an offer, not an action.
 * The sparkle is the whole tell — used here and nowhere else, so its presence
 * is a reliable signal that generated text is about to appear.
 *
 * The spinner replaces the sparkle rather than sitting beside it, so the button
 * keeps its width and the row doesn't jump while a draft is coming back.
 */
export function AiButton({
  pending = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps & { pending?: boolean }) {
  return (
    <Button
      type="button"
      variant="soft"
      size="sm"
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn(
        "gap-1.5 ring-1 ring-inset ring-accent/20 transition-[filter,box-shadow] hover:ring-accent/45",
        className,
      )}
      {...props}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {children}
    </Button>
  );
}
