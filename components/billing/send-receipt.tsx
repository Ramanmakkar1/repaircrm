"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";

/**
 * PAYMENT RECEIPT — the email a customer expects the second their card clears.
 *
 * Two surfaces, one action:
 *
 *   · `EmailReceiptButton` sits on a settled invoice, for the customer who
 *     phones a week later asking for "something for my records".
 *
 *   · `offerReceiptToast` fires from the take-payment dialog the moment a
 *     payment clears the balance. That is the only moment both the customer and
 *     the member of staff are standing there — an offer made ten seconds later
 *     is an offer nobody takes.
 *
 * The receipt is deliberately NOT sent automatically. A shop that emails
 * unprompted after a counter payment surprises people, and lib/comms would
 * cheerfully file a "skipped: opted out" row nobody asked for. One tap, and the
 * outcome is reported honestly.
 */

export type ReceiptAction = (
  invoiceId: string,
) => Promise<{ ok: boolean; message: string }>;

/** Shared by both surfaces so the toast wording cannot drift. */
async function runReceipt(invoiceId: string, action: ReceiptAction) {
  const result = await action(invoiceId);
  if (result.ok) toast.success(result.message);
  else toast.warning(result.message);
  return result.ok;
}

export function EmailReceiptButton({
  invoiceId,
  action,
  blockedReason,
  size,
}: {
  invoiceId: string;
  action: ReceiptAction;
  /** Rendered as the button's tooltip when the customer cannot be emailed. */
  blockedReason?: string | null;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (blockedReason) {
    return (
      <Button variant="outline" size={size} disabled title={blockedReason}>
        <ACTIONS.email /> Email receipt
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await runReceipt(invoiceId, action);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.email />}
      {busy ? "Sending…" : "Email receipt"}
    </Button>
  );
}

/**
 * "Paid in full" with an "Email receipt" button attached.
 *
 * Called by the take-payment dialog when the action reports the invoice
 * settled. Sonner keeps the toast up for the full duration whether or not the
 * action is used, so declining costs nothing.
 */
export function offerReceiptToast(
  invoiceId: string,
  action: ReceiptAction,
  message = "Paid in full.",
) {
  toast.success(message, {
    duration: 10_000,
    action: {
      label: "Email receipt",
      onClick: () => {
        void runReceipt(invoiceId, action);
      },
    },
  });
}
