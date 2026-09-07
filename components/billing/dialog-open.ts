"use client";

import * as React from "react";

/**
 * LETTING A SELF-CONTAINED DIALOG BE OPENED FROM SOMEWHERE ELSE.
 *
 * The billing dialogs — take payment, refund, void, charge the card on file,
 * collect a signature — each own their trigger button and their own `open`
 * state, which is exactly right when they sit in a row of buttons. It stops
 * being right the moment one of them has to live inside a `DropdownMenu`: the
 * menu unmounts its content when it closes, so a dialog whose only trigger is
 * a menu item disappears at the instant it was asked to appear.
 *
 * So the dialog moves out of the menu and the menu keeps a key saying which one
 * is open. That needs the dialog to accept `open`/`onOpenChange` from outside
 * without losing the self-contained behaviour every other caller relies on —
 * the standard controlled/uncontrolled split, written once here rather than
 * five times with five slightly different bugs.
 *
 * `controlled` is the third thing a caller needs: a driven dialog must render
 * NO trigger of its own, or the button it was supposed to replace is still
 * sitting in the action row.
 */
export type ControlledDialog = {
  /**
   * Pass `open` (and `onOpenChange`) to drive the dialog from outside — an
   * overflow-menu item. Omit both and the dialog opens itself from its own
   * trigger, which is what every button-row caller wants.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function useDialogOpen({
  open,
  onOpenChange,
  onOpen,
}: ControlledDialog & {
  /**
   * "Start from a clean sheet." Several of these dialogs reset their fields
   * every time they open, and they used to do it inside their own
   * `onOpenChange` — which a driven dialog never receives, because the driver
   * flips `open` without asking. Hanging the reset here means it fires on every
   * false → true transition however it was caused.
   *
   * Called during render, not from an effect: `react-hooks/set-state-in-effect`
   * is enforced in this codebase, and a form that resets one frame late is a
   * form that visibly flashes the last refund's numbers. Setting state during
   * render is React's own answer for exactly this — see `ScheduleActiveSwitch`.
   *
   * Declare the fields it resets ABOVE the `useDialogOpen` call, or the closure
   * runs into their temporal dead zone.
   */
  onOpen?: () => void;
}): {
  open: boolean;
  /** Call this from inside the dialog too — closing after a successful submit
   *  has to reach the driver, not just the local state it isn't using. */
  setOpen: (next: boolean) => void;
  /** True when someone else owns `open`: render no trigger. */
  controlled: boolean;
} {
  const [internal, setInternal] = React.useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internal;

  const [wasOpen, setWasOpen] = React.useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) onOpen?.();
  }

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInternal(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  return { open: isOpen, setOpen, controlled };
}
