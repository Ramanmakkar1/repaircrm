"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkMarkInvoicesSentAction,
  bulkSendInvoicesAction,
} from "@/app/(app)/invoices/actions";
import { useRowSelection } from "@/components/list/selection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/components/ui/icons";
import type { BulkResult } from "@/lib/bulk";

/**
 * Bulk verbs for the invoice list.
 *
 * THREE, AND NOT A FOURTH. "Mark paid" is missing on purpose and should stay
 * missing: a payment needs an amount, a method and a reference, and a button
 * that applies one to nine invoices at once has to invent all three. The shop
 * finds out at reconciliation. Money stays in `takePaymentAction`, one invoice
 * and one dialog at a time.
 *
 *   · Send — emails the document. Confirmed, because it leaves the building and
 *     there is no unsend; every other bulk verb in the app is a status move a
 *     second click can walk back.
 *   · Mark sent — DRAFT → SENT with no email, for the ones handed over at the
 *     counter or put in the post. Drafts only; it can never walk a status back.
 *   · Print — a link to the batch sheet, no write at all.
 */
export function InvoiceBulkActions() {
  const selection = useRowSelection();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmingSend, setConfirmingSend] = React.useState(false);

  const ids = [...selection.selected];
  const count = selection.count;

  async function run(work: () => Promise<BulkResult>) {
    setBusy(true);
    const result = await work();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    selection.clear();
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => setConfirmingSend(true)}
      >
        <ACTIONS.send />
        Send
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void run(() => bulkMarkInvoicesSentAction(ids))}
      >
        <ACTIONS.save />
        Mark sent
      </Button>

      <Button size="sm" variant="outline" asChild>
        <Link
          href={`/print/invoices?ids=${ids.join(",")}`}
          target="_blank"
          rel="noopener"
        >
          <ACTIONS.print />
          Print
        </Link>
      </Button>

      <Dialog open={confirmingSend} onOpenChange={setConfirmingSend}>
        {/*
          The action bar clears the selection on Escape. Without this, one
          Escape would both cancel the send AND throw away the nine invoices
          the operator had just picked out.
        */}
        <DialogContent
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              Email {count} invoice{count === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              Each customer gets the standard invoice email with a link to their
              copy. Anyone who has opted out of email, has no address on file, or
              whose invoice is void or empty is skipped — you&rsquo;ll be told how
              many. A draft that is delivered moves to Sent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingSend(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                await run(() => bulkSendInvoicesAction(ids));
                setConfirmingSend(false);
              }}
            >
              <ACTIONS.send />
              {busy ? "Sending…" : "Send them"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
