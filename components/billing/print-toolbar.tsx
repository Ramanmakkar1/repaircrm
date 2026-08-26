"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * The only interactive chrome on a print route. It carries `no-print` so
 * `@media print` removes it, leaving a clean sheet.
 *
 * There is no PDF library in this app on purpose: "Save as PDF" in the browser
 * print dialog produces a better-looking, selectable-text document than a
 * hand-rolled renderer, and costs nothing to ship.
 */
export function PrintToolbar({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="no-print sticky top-0 z-10 mb-6 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-[13px] font-medium text-white transition-colors hover:bg-neutral-700"
      >
        <Printer className="size-4" />
        Print / Save as PDF
      </button>
    </div>
  );
}
