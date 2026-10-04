"use client";

import { Toaster, toast } from "sonner";
import type { ExternalToast } from "sonner";

/**
 * The app's one toast stack.
 *
 *   - Top centre, just under the controls row: the bottom of the screen
 *     belongs to the phone tab bar, the guided flows' Next / Pay bars and the
 *     Ask button, and a toast must never sit on any of them.
 *   - Big: 16px words, a 48px close button and a 44px Undo (globals.css,
 *     "Toasts").
 *   - Colours from the theme tokens, so Dark mode has dark toasts.
 *   - An error stays until it is closed, and says what to do next. A
 *     "Could not save" that vanishes after four seconds is a problem nobody
 *     saw.
 */

/** Below the 48px controls row and its padding, clear of a notch. */
export const TOAST_OFFSET = { top: "calc(env(safe-area-inset-top) + 72px)" } as const;

/** What to do, added under an error that does not already say. */
export function errorNextStep(message: unknown): string {
  const words = typeof message === "string" ? message.toLowerCase() : "";
  return /try again/.test(words)
    ? "If it keeps happening, reload the page."
    : "Try again. If it keeps happening, reload the page.";
}

/** The options every error toast gets unless the caller chose otherwise. */
export function errorToastOptions(message: unknown, data?: ExternalToast): ExternalToast {
  return {
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    ...(data?.description === undefined && typeof message === "string" ? { description: errorNextStep(message) } : {}),
    ...data,
  };
}

type ErrorFn = typeof toast.error & { __rfSticky?: true };

/**
 * Every `toast.error(...)` in the app (there are about 150) gets the sticky,
 * says-what-to-do behaviour without touching each call: the error function
 * is wrapped once, here, when the toaster loads. A caller that passes its own
 * duration or description keeps it.
 */
export function makeErrorsSticky(target: { error: ErrorFn } = toast as unknown as { error: ErrorFn }): void {
  if (target.error.__rfSticky) return;
  const original = target.error;
  const sticky: ErrorFn = ((message: Parameters<ErrorFn>[0], data?: ExternalToast) =>
    original(message, errorToastOptions(message, data))) as ErrorFn;
  sticky.__rfSticky = true;
  target.error = sticky;
}

makeErrorsSticky();

export function AppToaster({ theme = "system" }: { theme?: "system" | "light" | "dark" }) {
  return (
    <Toaster
      position="top-center"
      offset={TOAST_OFFSET}
      mobileOffset={{ top: TOAST_OFFSET.top, left: "12px", right: "12px" }}
      theme={theme}
      richColors
      closeButton
      visibleToasts={4}
      toastOptions={{ closeButtonAriaLabel: "Close message" }}
      containerAriaLabel="Messages"
    />
  );
}
