import * as React from "react";

import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { SEND_STATUS_META, sendBucket, sendStatusLabel } from "./meta";

/**
 * One outcome per message, in the app's own status language — so a marketing
 * send reads exactly the way a ticket, an invoice or a purchase order does.
 *
 * The reason travels in the label ("Skipped · Opted out"), because "skipped"
 * on its own sends staff to the database to find out why; the raw provider
 * string stays on the `title` for the one time somebody needs it verbatim.
 */
export function SendStatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const bucket = sendBucket(status);
  return (
    <StatusPill
      tone={SEND_STATUS_META[bucket].tone}
      label={sendStatusLabel(status)}
      title={status}
      className={cn("max-w-full", className)}
    />
  );
}
