"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Lock } from "lucide-react";

import { ACTIONS } from "@/components/ui/icons";
import { startInvoiceCheckoutAction } from "../invoices/[id]/actions";

const PayIcon = ACTIONS.pay;

/**
 * The pay button, as the customer sees it.
 *
 * One job, said in plain words with the amount in it: someone reading this on a
 * phone in a hallway should never have to wonder how much they are about to be
 * charged. The pending state matters more than usual — a second tap while the
 * session is being created is how people end up staring at two payment pages.
 *
 * Rendered only when payments are actually live (see lib/payments/config.ts).
 * A payment button that cannot take a payment is worse than no button.
 */
export function PayOnlineButton({
  invoiceId,
  amountLabel,
}: {
  invoiceId: string;
  amountLabel: string;
}) {
  return (
    <form action={startInvoiceCheckoutAction} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <PaySubmit amountLabel={amountLabel} />
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Lock className="size-3.5" />
        Card details are entered on Stripe, never on this site.
      </p>
    </form>
  );
}

function PaySubmit({ amountLabel }: { amountLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-60 sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Opening secure checkout…
        </>
      ) : (
        <>
          <PayIcon className="size-4" aria-hidden />
          Pay {amountLabel} online
        </>
      )}
    </button>
  );
}
