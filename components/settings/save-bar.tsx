"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * The one Save of a settings panel, pinned to the bottom of the screen while
 * the panel scrolls (above the phone's tab bar), so it is never between two
 * cards and never off screen.
 *
 * Every panel in Settings follows one of two rules, and says which in words:
 * a panel with fields to fill in ends with this bar; a list you change one row
 * at a time (tax rates, saved replies, people, the device boxes) saves each
 * change on its own and says "Saved".
 *
 * The button sits on the LEFT of the bar: the assistant dock floats over the
 * bottom right corner of a tablet, and the one thing that must never be under
 * it is the Save button.
 */
export type SaveBarState = "clean" | "dirty" | "saving" | "saved" | "invalid";

export function saveBarMessage(state: SaveBarState, message?: string | null): string {
  if (message) return message;
  switch (state) {
    case "dirty":
      return "You have changes that are not saved yet.";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved.";
    case "invalid":
      return "Fix the highlighted box before saving.";
    default:
      return "No changes yet.";
  }
}

export function SaveBar({
  state,
  message,
  label = "Save changes",
  onSave,
  onDiscard,
  form,
  className,
}: {
  state: SaveBarState;
  /** Overrides the standard sentence (an error, or why it cannot be saved). */
  message?: string | null;
  label?: string;
  /** Click handler; leave out and pass `form` to submit a form by id instead. */
  onSave?: () => void;
  /** Shown while there are unsaved changes: puts the panel back how it was. */
  onDiscard?: () => void;
  /** The id of the <form> this bar submits (the button need not sit inside it). */
  form?: string;
  className?: string;
}) {
  const busy = state === "saving";
  const tone = state === "invalid" || (message && state !== "saved") ? "problem" : state;
  return (
    <div
      role="region"
      aria-label="Save"
      data-save-bar=""
      className={cn(
        "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 sm:bottom-4 print:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border-strong bg-surface p-3 shadow-lg">
        <Button
          type={form ? "submit" : "button"}
          form={form}
          onClick={onSave}
          disabled={busy || state === "invalid"}
          aria-disabled={state === "clean" ? true : undefined}
          className="h-12 shrink-0 px-6 text-base"
        >
          {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Check aria-hidden />}
          {busy ? "Saving…" : label}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "min-w-0 flex-1 text-[15px] font-medium leading-snug sm:flex-none",
            tone === "problem" ? "text-destructive" : tone === "dirty" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {state === "saved" && !message ? (
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-4" strokeWidth={3} /> Saved
            </span>
          ) : (
            saveBarMessage(state, message)
          )}
        </p>
        {state === "dirty" && onDiscard ? (
          <Button type="button" variant="ghost" onClick={onDiscard} className="h-12 px-4 text-[15px]">
            Undo changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Dirty tracking for a plain <form>: any edit makes it "dirty", a save in
 * flight is "saving", and a finished save is "saved" until the next edit.
 */
export function useFormSaveState() {
  const [state, setState] = React.useState<SaveBarState>("clean");
  const onEdit = React.useCallback(() => setState((current) => (current === "saving" ? current : "dirty")), []);
  return { state, setState, onEdit };
}
