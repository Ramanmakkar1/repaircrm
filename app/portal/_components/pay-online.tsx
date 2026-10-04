"use client";

import { useFormStatus } from "react-dom";
import { CreditCard, Loader2, Lock } from "lucide-react";

import { HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { startInvoiceCheckoutAction } from "../invoices/[id]/actions";

/**
 * The pay button, as the customer sees it.
 *
 * One job, said in plain words with the amount in it: someone reading this on a
 * phone in a hallway should never have to wonder how much they are about to be
 * charged. The pending state matters more than usual: a second tap while the
 * session is being created is how people end up staring at two payment pages.
 *
 * Rendered only when payments are actually live (see lib/payments/config.ts).
 * A payment button that cannot take a payment is worse than no button.
 */
export function PayOnlineButton({ invoiceId, amountLabel }: { invoiceId: string; amountLabel: string }) {
  return (
    <form action={startInvoiceCheckoutAction} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <PaySubmit amountLabel={amountLabel} />
      <p className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden />
        You type your card on the card company&rsquo;s secure page, never on this site.
      </p>
    </form>
  );
}

function PaySubmit({ amountLabel }: { amountLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className={HUGE_BUTTON}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CreditCard aria-hidden />}
      {pending ? "Opening the secure card page…" : `Pay ${amountLabel} by card`}
    </Button>
  );
}
