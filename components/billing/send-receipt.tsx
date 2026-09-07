"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ACTIONS } from "@/components/ui/icons";

/**
 * PAYMENT RECEIPT — the email a customer expects the second their card clears.
 *
 * Two surfaces, one action:
 *
 *   · `EmailReceiptMenuItem` sits in the settled invoice's overflow menu, for
 *     the customer who phones a week later asking for "something for my
 *     records". (It was a button in the header until that header grew eight of
 *     them; the action is unchanged.)
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

/**
 * The action as a menu item — the invoice header's secondary actions all live
 * behind a `⋯`.
 *
 * No busy state: a menu closes the moment you pick from it, so there is nothing
 * left on screen to spin. `runReceipt` reports the outcome as a toast, exactly
 * as it does for the offer made at the counter.
 */
export function EmailReceiptMenuItem({
  invoiceId,
  action,
  blockedReason,
}: {
  invoiceId: string;
  action: ReceiptAction;
  /** Why the customer cannot be emailed; disables the item and titles it. */
  blockedReason?: string | null;
}) {
  const router = useRouter();

  return (
    <DropdownMenuItem
      disabled={Boolean(blockedReason)}
      title={blockedReason ?? undefined}
      onSelect={() => {
        void (async () => {
          await runReceipt(invoiceId, action);
          router.refresh();
        })();
      }}
    >
      <ACTIONS.email className="size-4 text-muted-foreground" />
      Email receipt
    </DropdownMenuItem>
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
