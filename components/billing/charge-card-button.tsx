"use client";

import * as React from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/money";

/**
 * "Charge card on file" — one click, one confirmation, one charge.
 *
 * THE CONFIRMATION IS NOT CEREMONY. Every other payment button in this app
 * records money that has already moved; this one MOVES it. A customer's card
 * being debited because somebody's thumb landed on the wrong row is a
 * chargeback, so the amount and the card are restated and the button says
 * exactly what it will do.
 *
 * The amount shown is the balance as this page was rendered. The server
 * recomputes it from the invoice's own rows before charging, so a stale figure
 * here can only ever be a display bug, never a wrong charge.
 */
export function ChargeCardButton({
  invoiceId,
  balanceCents,
  cardLabel,
  customerName,
  action,
}: {
  invoiceId: string;
  balanceCents: number;
  /** e.g. "Visa ····4242". */
  cardLabel: string;
  customerName: string;
  action: (
    invoiceId: string,
  ) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const charge = () => {
    startTransition(async () => {
      const result = await action(invoiceId);
      if (result.ok) {
        setOpen(false);
        toast.success(result.message);
      } else {
        // Left open on purpose: a decline reason is something staff read out to
        // the customer, and closing the dialog would take it away.
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wallet /> Charge card on file
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Charge {formatCents(balanceCents)}?</DialogTitle>
          <DialogDescription>
            {customerName}&rsquo;s {cardLabel} will be charged the full
            outstanding balance right now.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md bg-surface-hover px-3.5 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
          The customer is not present to approve this, so a card whose bank
          wants a challenge will decline. Send them a payment link instead if
          that happens.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={charge}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" /> Charging…
              </>
            ) : (
              `Charge ${formatCents(balanceCents)}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
