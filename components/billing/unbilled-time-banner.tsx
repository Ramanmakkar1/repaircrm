"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { addTimeToInvoiceAction } from "@/app/(app)/invoices/time-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";

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
  large = false,
}: {
  invoiceId: string;
  entryCount: number;
  durationLabel: string;
  amountLabel: string;
  /** Easy mode: bigger words, a 48px button and the rounder corner of the bill's other boxes. */
  large?: boolean;
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
    // A soft amber panel, because it is money the shop has earned and not yet
    // asked for. A whole tinted box, not the card's left stripe: the words say
    // what it is, and the tint only adds emphasis.
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-3 border border-status-in-progress/30 bg-status-in-progress-bg",
        large ? "rounded-2xl p-4" : "rounded-lg px-4 py-3",
      )}
    >
      <span className={cn("flex items-center gap-2 text-foreground", large ? "text-base" : "text-[14px]")}>
        <ICONS.timeClock className={cn("shrink-0 text-muted-foreground", large ? "size-5" : "size-4")} />
        <span>
          <strong className="font-semibold">
            {entryCount} unbilled time {entryCount === 1 ? "entry" : "entries"}
          </strong>{" "}
          <span className="text-muted-foreground">
            ({durationLabel} · {amountLabel})
          </span>
        </span>
      </span>
      <Button
        variant="outline"
        disabled={busy}
        onClick={add}
        className={cn("bg-surface", large && "h-12 px-5 text-base")}
      >
        {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.add />}
        {busy ? "Adding…" : "Add to invoice"}
      </Button>
    </div>
  );
}
