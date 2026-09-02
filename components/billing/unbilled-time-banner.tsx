"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { toast } from "sonner";

import { addTimeToInvoiceAction } from "@/app/(app)/invoices/time-actions";
import { Button } from "@/components/ui/button";

/**
 * "There is time on this repair that is not on this bill."
 *
 * A slim strip above the line items rather than a card: it is a prompt, not a
 * section, and it disappears the moment the time is billed. Shown only while
 * the invoice can still take lines — see addTimeToInvoiceAction for the rule.
 */
export function UnbilledTimeBanner({
  invoiceId,
  entryCount,
  /** h:mm, already rounded to the shop's billing increment. */
  durationLabel,
  /** What those hours come to, formatted. */
  amountLabel,
}: {
  invoiceId: string;
  entryCount: number;
  durationLabel: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function add() {
    setBusy(true);
    const result = await addTimeToInvoiceAction(invoiceId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-hover px-4 py-3">
      <span className="flex items-center gap-2 text-[14px] text-foreground">
        <Timer className="size-4 shrink-0 text-muted-foreground" />
        <span>
          <strong className="font-semibold">
            {entryCount} unbilled time {entryCount === 1 ? "entry" : "entries"}
          </strong>{" "}
          <span className="text-muted-foreground">
            ({durationLabel} · {amountLabel})
          </span>
        </span>
      </span>
      <Button variant="outline" size="sm" disabled={busy} onClick={add}>
        {busy ? "Adding…" : "Add to invoice"}
      </Button>
    </div>
  );
}
