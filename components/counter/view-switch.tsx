"use client";

import { LayoutGrid, PanelsTopLeft } from "lucide-react";
import { SimpleModeButton } from "./simple-mode-button";

/** A device preference only: both views use the same records and workflows. */
export function ViewSwitch({ simple }: { simple: boolean }) {
  return (
    <div role="group" aria-label="Dashboard view" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white p-1">
      <SimpleModeButton on size="sm" variant={simple ? "default" : "ghost"} aria-pressed={simple} className="gap-2 px-3">
        <LayoutGrid className="size-4" /> Easy mode
      </SimpleModeButton>
      <SimpleModeButton on={false} size="sm" variant={simple ? "ghost" : "default"} aria-pressed={!simple} className="gap-2 px-3">
        <PanelsTopLeft className="size-4" /> Full view
      </SimpleModeButton>
    </div>
  );
}
