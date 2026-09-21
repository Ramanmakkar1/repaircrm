"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { resolveScanAction } from "@/app/(app)/scan/actions";
import { isScanHit, type ScanResult } from "@/lib/scan/types";
import { useHardwareScanner } from "./use-hardware-scanner";

/**
 * App-wide USB scan-gun routing.
 *
 * Mounted once in the app shell, this listens for a barcode gun firing anywhere
 * (with nothing focused), looks the code up, and jumps to whatever it is — a
 * product, a serialised unit, or one of the shop's own printed documents. That
 * is the "show a label and it opens" behaviour a counter expects from a gun,
 * and it needs no field to be focused first.
 *
 * It stays OUT of surfaces that consume scans themselves: on the register a scan
 * means "add to the sale", not "navigate away", so `/pos` handles its own gun
 * input (components/pos/register.tsx) and the wedge is disabled there. Camera
 * and phone scanning are unaffected — this only adds the hardware-gun path.
 */

/** Routes that own scanning; the wedge must not navigate away from them. */
const OWNS_SCANNING = [/^\/pos(?:\/|$)/];

export function HardwareScanRouter() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  // Guns can fire twice in quick succession; one lookup at a time avoids a
  // double navigation.
  const busyRef = React.useRef(false);

  const disabled = OWNS_SCANNING.some((pattern) => pattern.test(pathname));

  const handleScan = React.useCallback(
    async (code: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const result = await resolveScanAction(code);
        if (isScanHit(result)) {
          toast.success(scanLabel(result));
          router.push(result.href);
        } else {
          toast.error(`No match for “${code}”`);
        }
      } catch {
        toast.error("Couldn't look up that scan — try again.");
      } finally {
        busyRef.current = false;
      }
    },
    [router],
  );

  useHardwareScanner({ onScan: handleScan, disabled });

  return null;
}

/** A one-line "what did I just jump to" for the toast. */
function scanLabel(hit: Exclude<ScanResult, { kind: "none" }>): string {
  switch (hit.kind) {
    case "product":
      return hit.product.name;
    case "serial":
      return `${hit.serial.productName} · ${hit.serial.serial}`;
    default:
      return hit.label; // ticket / invoice / estimate / purchase-order
  }
}
