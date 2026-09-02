"use client";

import * as React from "react";
import Link from "next/link";
import { ACTIONS } from "@/components/ui/icons";

/**
 * The only interactive chrome on a print route. It carries `.rf-toolbar`, which
 * `@media print` removes, leaving a clean sheet — and on screen it turns the
 * route into something that reads like a PDF preview: a dark app bar over a grey
 * backdrop with the page floating below it.
 *
 * There is no PDF library in this app on purpose: "Save as PDF" in the browser
 * print dialog produces a better-looking, selectable-text document than a
 * hand-rolled renderer, and costs nothing to ship.
 */
export function PrintToolbar({
  backHref,
  backLabel,
  title,
  children,
}: {
  backHref: string;
  backLabel: string;
  /** Centre label — which document this preview is showing. */
  title?: string;
  /** Extra controls (e.g. the label-count picker) rendered before Print. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rf-toolbar no-print">
      <Link href={backHref} className="rf-toolbar-back">
        <ACTIONS.back className="size-4" />
        {backLabel}
      </Link>

      {title ? <div className="rf-toolbar-title">{title}</div> : null}

      <div className="rf-toolbar-actions">
        {children}
        <button
          type="button"
          className="rf-toolbar-print"
          onClick={() => window.print()}
        >
          <ACTIONS.print className="size-4" />
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
