"use client";

import { Button } from "./button";

/**
 * Changes presentation only; the same mounted form keeps every entered value.
 *
 * The label says what tapping does and flips with the mode, so it is a plain
 * button: adding `aria-pressed` on top would announce "Use quick entry,
 * pressed" — a command and a state at once, which reads as a contradiction.
 */
export function EntryMode({ guided, onChange, disabled }: {
  guided: boolean;
  onChange: (guided: boolean) => void;
  disabled: boolean;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <p className="text-sm text-muted-foreground">{guided ? "One step at a time." : "Enter the details and save on one screen."}</p>
    <Button type="button" variant="outline" className="min-h-12" disabled={disabled} onClick={() => onChange(!guided)}>
      {guided ? "Use quick entry" : "Use step-by-step"}
    </Button>
  </div>;
}
