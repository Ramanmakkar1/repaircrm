import * as React from "react";
import { cn } from "@/components/ui/cn";
import { sendBucket, sendStatusLabel } from "./meta";

/**
 * One colour per outcome, reusing the app's status palette so a marketing send
 * reads the same way a ticket or an invoice does:
 *   scheduled → waiting · sent → resolved · skipped → grey · failed → overdue
 *
 * The reason travels in the label ("Skipped · Opted out"), because "skipped"
 * on its own sends staff to the database to find out why.
 */
const TONE: Record<ReturnType<typeof sendBucket>, string> = {
  scheduled: "bg-status-waiting-bg text-status-waiting-fg",
  sending: "bg-status-in-progress-bg text-status-in-progress-fg",
  sent: "bg-status-resolved-bg text-status-resolved-fg",
  skipped: "bg-surface-hover text-muted-foreground",
  failed: "bg-status-overdue-bg text-status-overdue-fg",
};

const DOT: Record<ReturnType<typeof sendBucket>, string> = {
  scheduled: "bg-status-waiting",
  sending: "bg-status-in-progress",
  sent: "bg-status-resolved",
  skipped: "bg-faint-foreground",
  failed: "bg-status-overdue",
};

export function SendStatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const bucket = sendBucket(status);
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
        TONE[bucket],
        className,
      )}
      title={status}
    >
      <span className={cn("size-2 shrink-0 rounded-full", DOT[bucket])} />
      <span className="truncate">{sendStatusLabel(status)}</span>
    </span>
  );
}
