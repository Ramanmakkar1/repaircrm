import * as React from "react";
import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The one slim bar above the one-screen register: "Sell" on the left, and on the
 * right the drawer chip and the phone-scanner button. It replaces the big page
 * header and the drawer banner, and wraps onto a second line on a narrow phone
 * instead of overflowing.
 */
export function PosToolbar({
  drawer,
  onPhoneScanner,
}: {
  /** The drawer chip, rendered by the page. */
  drawer?: React.ReactNode;
  /** Omit when the scanner dialog is not on screen (for example after a sale). */
  onPhoneScanner?: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 className="text-[28px] font-semibold leading-9 tracking-tight sm:text-[32px] lg:text-[28px]">
        Sell
      </h1>
      <div className="flex items-center gap-2">
        {drawer}
        {onPhoneScanner ? (
          <Button
            variant="outline"
            onClick={onPhoneScanner}
            aria-label="Phone scanner"
            title="Use my phone as a scanner"
            className="h-12 px-3.5 text-[14px] sm:px-4"
          >
            <Smartphone className="size-5" aria-hidden />
            <span className="hidden sm:inline">Phone scanner</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
