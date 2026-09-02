"use client";

import * as React from "react";
import { ScanLine } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ScannerDialog, type ScanHandler } from "./scanner-dialog";
import { cameraBlocker, hasCamera } from "./support";

/**
 * The little camera button that sits next to a code field.
 *
 * ---------------------------------------------------------------------------
 * IT HIDES ITSELF
 * ---------------------------------------------------------------------------
 * A desktop till has no camera, and a scan button that opens a black rectangle
 * on it is worse than no button at all. So this renders NOTHING until it has
 * confirmed the device has a video input — which is a one-off async check that
 * needs no permission and settles in a millisecond or two.
 *
 * The plain-http case is the exception: the hardware is there, the browser is
 * simply refusing to hand it over, and the person deserves to be told why
 * rather than left wondering where the button went. So the button stays and the
 * dialog explains (and still takes a typed code).
 *
 * Everything else — the camera, the torch, the fallbacks — belongs to
 * ScannerDialog; this is only the affordance that opens it.
 */
export function ScanButton({
  onScan,
  continuous = false,
  title,
  description,
  label = "Scan",
  /** Show the word as well as the icon. Off by default: it sits beside inputs. */
  showLabel = false,
  variant = "outline",
  size,
  className,
  disabled,
}: {
  onScan: ScanHandler;
  continuous?: boolean;
  title?: string;
  description?: string;
  /** Accessible name, and the visible text when `showLabel` is set. */
  label?: string;
  showLabel?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
}) {
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blocker = cameraBlocker();
      // Plain http keeps the button: the hardware is there and the dialog can
      // explain the HTTPS rule. No getUserMedia at all takes it away.
      const usable =
        blocker === "insecure" ? true : blocker ? false : await hasCamera();
      if (!cancelled) setAvailable(usable);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (available !== true) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size ?? (showLabel ? "default" : "icon")}
        className={cn("shrink-0", className)}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={showLabel ? undefined : label}
        title={label}
      >
        <ScanLine />
        {showLabel ? label : null}
      </Button>

      <ScannerDialog
        open={open}
        onOpenChange={setOpen}
        onScan={onScan}
        continuous={continuous}
        title={title}
        description={description}
      />
    </>
  );
}
