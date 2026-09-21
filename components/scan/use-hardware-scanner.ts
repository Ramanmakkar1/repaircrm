"use client";

import * as React from "react";

/**
 * USB scan-gun support (a "keyboard wedge").
 *
 * A USB or wireless barcode gun is not a special device to the browser — it is
 * a KEYBOARD. It "types" the barcode's characters and finishes with Enter,
 * exactly like a very fast human. So there is no driver, no pairing, no USB API:
 * the only job is to tell a gun's burst apart from real typing and hand the
 * decoded string to a caller.
 *
 * THE TELL IS TIMING. A gun's keystrokes land within a few milliseconds of each
 * other; a person's don't. `createScanDetector` keeps only a run of keystrokes
 * that each arrived inside `maxInterKeyMs` of the last, and treats that run as a
 * scan when Enter closes it. A stray human keypress can't accumulate, because
 * the next slow keystroke starts the run over.
 *
 * The detector is a pure state machine (no DOM), so the timing rules can be unit
 * tested without a browser; the hook is the thin DOM wrapper around it.
 */

export type ScanDetector = {
  /**
   * Feed one keydown. Returns the decoded string at the moment a scan
   * completes (the closing Enter), or null for every keystroke before that.
   */
  feed: (key: string, timeStamp: number) => string | null;
  reset: () => void;
};

export function createScanDetector({
  minLength = 3,
  maxInterKeyMs = 50,
}: { minLength?: number; maxInterKeyMs?: number } = {}): ScanDetector {
  let buffer = "";
  let lastTime = 0;

  const reset = () => {
    buffer = "";
    lastTime = 0;
  };

  return {
    reset,
    feed(key, timeStamp) {
      // A scan ends in Enter. It only counts if enough fast characters preceded
      // it — otherwise it's just someone pressing Return.
      if (key === "Enter") {
        const code = buffer.length >= minLength ? buffer : null;
        reset();
        return code;
      }

      // Shift rides along for uppercase characters; it is not itself one.
      if (key === "Shift") return null;

      // Any other non-character key (Tab, an arrow, a function key) can't be
      // part of a barcode, so it breaks the run.
      if (key.length !== 1) {
        reset();
        return null;
      }

      const gap = lastTime === 0 ? 0 : timeStamp - lastTime;
      // Too slow to be a gun continuation → this character starts a fresh run.
      buffer = gap > maxInterKeyMs ? key : buffer + key;
      lastTime = timeStamp;
      return null;
    },
  };
}

/** An editable target owns its own keystrokes; the wedge must not read them. */
function isEditable(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

/**
 * Calls `onScan` with the decoded string whenever a barcode gun fires, while
 * nothing editable is focused.
 *
 * Ignoring focused fields is deliberate: a gun aimed at the POS search box or a
 * code field is already handled there (it just types into it), and the wedge is
 * for scanning with nothing focused — "show it a label anywhere and it acts".
 */
export function useHardwareScanner({
  onScan,
  disabled = false,
  minLength,
  maxInterKeyMs,
}: {
  onScan: (code: string) => void;
  disabled?: boolean;
  minLength?: number;
  maxInterKeyMs?: number;
}): void {
  // A ref keeps the listener stable while `onScan` can close over fresh state.
  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (disabled) return;

    const detector = createScanDetector({ minLength, maxInterKeyMs });

    function handleKeyDown(event: KeyboardEvent) {
      // Shortcuts (⌘K etc.) and IME composition are never scans.
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return;
      }
      if (isEditable(event.target) || isEditable(document.activeElement)) return;

      const code = detector.feed(event.key, event.timeStamp || performance.now());
      if (code !== null) {
        // Swallow the closing Enter of a real scan in the capture phase, so it
        // can't also submit a form or trigger a shortcut.
        event.preventDefault();
        event.stopPropagation();
        onScanRef.current(code);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, minLength, maxInterKeyMs]);
}
