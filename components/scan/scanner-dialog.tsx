"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { CameraView, ManualEntry } from "./camera-view";
import { useScanner, type ScanHandler } from "./use-scanner";

export type { ScanHandler };

/**
 * The scanner, as a dialog beside whatever field it is filling in.
 *
 * Most repair shops do not own a barcode gun. They do own a phone. This is the
 * gun: point it at a box, feel the buzz, and the code lands where the caller
 * wanted it — the register's cart, a UPC field, a list of serials.
 *
 * All the machinery is in `useScanner` and `CameraView`; what this adds is the
 * dialog itself — focus trapping, Escape and the labelled title all come from
 * Radix — plus the confirmation line and the always-present typed fallback.
 *
 * `continuous` is the difference between "scan this one thing" (closes on the
 * first hit) and "scan the whole box" (stays open with a running tally), which
 * is what receiving a delivery or building a cart actually looks like.
 */
export function ScannerDialog({
  open,
  onOpenChange,
  onScan,
  continuous = false,
  title = "Scan a barcode",
  description = "Hold the code inside the frame.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: ScanHandler;
  /** Stay open and keep scanning. One-shot (the default) closes on the first hit. */
  continuous?: boolean;
  title?: string;
  description?: string;
}) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  const scanner = useScanner({
    active: open,
    continuous,
    onScan,
    onDone: close,
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            "rf-dialog-content fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl outline-none",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[13.5px] text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close scanner"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-faint-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ACTIONS.cancel className="size-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <CameraView scanner={scanner} />

          {scanner.lastHit ? (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-lg border border-status-resolved/30 bg-status-resolved-bg px-3.5 py-2.5"
            >
              <CheckCircle2 className="size-4 shrink-0 text-status-resolved-fg" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] font-semibold text-status-resolved-fg">
                  {scanner.lastHit.note}
                </span>
                <span className="truncate font-mono text-[12px] text-status-resolved-fg/80">
                  {scanner.lastHit.value}
                </span>
              </span>
              {continuous && scanner.count > 0 ? (
                <span className="ml-auto shrink-0 rounded-full bg-status-resolved/15 px-2.5 py-1 text-[12px] font-bold tabular-nums text-status-resolved-fg">
                  {scanner.count}
                </span>
              ) : null}
            </div>
          ) : null}

          <ManualEntry
            onSubmit={(value) => scanner.submit({ value, format: "Typed" })}
          />

          <p className="flex items-center gap-1.5 text-[12px] text-faint-foreground">
            <ACTIONS.scan className="size-3.5 shrink-0" />
            {continuous
              ? "Keeps scanning — close it when you're done."
              : "Closes as soon as it reads a code."}
          </p>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
