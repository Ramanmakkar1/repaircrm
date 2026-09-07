"use client";

import { toast } from "sonner";

/**
 * "Done · Undo" instead of "Are you sure?".
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 * A confirm dialog taxes the common case to protect the rare one. Every single
 * deletion costs a modal, a read, and a second click — and after the twentieth
 * one nobody reads it anyway, so it stops protecting anything while still
 * costing everybody a click. Undo inverts that: the common path is one click,
 * and the rare mistake is recoverable for as long as the toast is up.
 *
 * ---------------------------------------------------------------------------
 * WHEN TO STILL USE A DIALOG
 * ---------------------------------------------------------------------------
 * When the action is genuinely NOT undoable, and only then:
 *
 *   · it moved money (a refund, a Stripe charge)
 *   · it left the building (an email or SMS to a customer)
 *   · it is an accounting record the shop is required to keep
 *
 * Cancelling a purchase order stays a dialog for exactly this reason. Deleting
 * a canned response, archiving a lead, removing a checklist item, unassigning
 * a tech — those should all be undo.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRACT THE CALLER MUST HONOUR
 * ---------------------------------------------------------------------------
 * `undo` must actually restore the record. If the action hard-deletes a row,
 * an Undo button that cannot bring it back is a lie, and worse than no button
 * at all — so a caller with no real reverse should use a dialog instead of
 * passing a no-op here.
 */
export function toastWithUndo({
  message,
  description,
  undo,
  onUndoError = "Could not undo that.",
  duration = 8000,
}: {
  /** What happened, in the past tense: "Lead archived". */
  message: string;
  description?: string;
  /** Puts it back. Awaited; a rejection surfaces as an error toast. */
  undo: () => Promise<unknown>;
  onUndoError?: string;
  /**
   * Eight seconds, not sonner's four. Undo is only useful if it is still there
   * when you realise — and realising takes a beat longer than reading.
   */
  duration?: number;
}): void {
  toast.success(message, {
    description,
    duration,
    action: {
      label: "Undo",
      onClick: () => {
        // Fire and report. The toast is already closing by the time this runs,
        // so the outcome needs a toast of its own either way.
        void undo().then(
          () => toast.success("Undone."),
          (error: unknown) =>
            toast.error(
              error instanceof Error && error.message ? error.message : onUndoError,
            ),
        );
      },
    },
  });
}
