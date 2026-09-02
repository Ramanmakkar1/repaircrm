"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// HandCoins has no concept in components/ui/icons.ts.
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import {
  emailDepositReceiptAction,
  refundDepositAction,
  takeDepositAction,
} from "@/app/(app)/tickets/deposit-actions";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/** One deposit as the ticket page loads it. */
export type DepositRow = {
  id: string;
  amountCents: number;
  methodLabel: string;
  reference: string | null;
  takenByName: string | null;
  createdAtLabel: string;
  /** Set once the deposit has been spent against an invoice. */
  appliedInvoiceNumber: number | null;
  appliedInvoiceId: string | null;
  refunded: boolean;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Money taken up front, before the work starts.
 *
 * A deposit is not a payment on an invoice — there is no invoice yet. It goes
 * onto the customer's store credit and comes off the bill automatically the
 * moment this ticket is invoiced, which is why the card says so out loud: the
 * front desk should never have to remember to apply it.
 *
 * Refunding is owner-only and only offered while the money is still sitting
 * unapplied. Once it is on an invoice, refunding the invoice is the honest
 * route and the button is simply absent rather than dead.
 */
export function DepositCard({
  ticketId,
  ticketNumber,
  customerName,
  deposits,
  isOwner,
}: {
  ticketId: string;
  ticketNumber: number;
  customerName: string;
  deposits: DepositRow[];
  isOwner: boolean;
}) {
  const held = deposits
    .filter((deposit) => !deposit.refunded && deposit.appliedInvoiceId === null)
    .reduce((sum, deposit) => sum + deposit.amountCents, 0);

  return (
    <Card>
      <CardHeader
        icon={HandCoins}
        title="Deposit"
        action={
          held > 0 ? (
            <StatusPill
              size="sm"
              tone="success"
              label={`${formatCents(held)} held`}
              className="tabular-nums"
            />
          ) : null
        }
      />

      <CardContent className="flex flex-col gap-3">
        <TakeDepositDialog
          ticketId={ticketId}
          ticketNumber={ticketNumber}
          customerName={customerName}
        />

        {deposits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing taken up front. A deposit lands on the customer&rsquo;s
            account and comes off this ticket&rsquo;s invoice automatically.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {deposits.map((deposit) => (
              <DepositLine key={deposit.id} deposit={deposit} isOwner={isOwner} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DepositLine({
  deposit,
  isOwner,
}: {
  deposit: DepositRow;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const unapplied = !deposit.refunded && deposit.appliedInvoiceId === null;

  async function emailReceipt() {
    setBusy(true);
    const result = await emailDepositReceiptAction(deposit.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    router.refresh();
  }

  async function refund() {
    setBusy(true);
    const result = await refundDepositAction(deposit.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    setConfirming(false);
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-[15px] font-bold tabular-nums",
            deposit.refunded
              ? "text-faint-foreground line-through"
              : "text-foreground",
          )}
        >
          {formatCents(deposit.amountCents)}
        </span>
        <span className="text-xs text-muted-foreground">
          {deposit.methodLabel} · {deposit.createdAtLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {deposit.refunded
          ? "Refunded"
          : deposit.appliedInvoiceNumber !== null
            ? `Applied to invoice #${deposit.appliedInvoiceNumber}`
            : "Held on the customer's account"}
        {deposit.takenByName ? ` · ${deposit.takenByName}` : ""}
        {deposit.reference ? ` · ${deposit.reference}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
          <Link href={`/print/deposits/${deposit.id}`} target="_blank">
            <ICONS.print className="size-3.5" />
            Receipt
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={busy}
          onClick={emailReceipt}
        >
          <ICONS.email className="size-3.5" />
          Email
        </Button>
        {isOwner && unapplied ? (
          <Dialog
            open={confirming}
            onOpenChange={(next) => {
              if (!busy) setConfirming(next);
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-faint-foreground hover:text-destructive"
              >
                <ICONS.refund className="size-3.5" />
                Refund
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  Refund {formatCents(deposit.amountCents)}?
                </DialogTitle>
                <DialogDescription>
                  The money comes back off the customer&rsquo;s account and the
                  ledger records the reversal. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" disabled={busy} onClick={refund}>
                  <ACTIONS.refund />
              {busy ? "Refunding…" : "Refund deposit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </li>
  );
}

function TakeDepositDialog({
  ticketId,
  ticketNumber,
  customerName,
}: {
  ticketId: string;
  ticketNumber: number;
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<string>("CARD");
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setAmount("");
    setMethod("CARD");
    setReference("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await takeDepositAction({
      ticketId,
      amount,
      method,
      reference,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-full">
          <HandCoins className="size-4" />
          Take deposit
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Take a deposit</DialogTitle>
          <DialogDescription>
            Money up front from {customerName} for ticket #{ticketNumber}. It is
            held on their account and comes off the invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deposit-amount">Amount</Label>
            <Input
              id="deposit-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right tabular-nums"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deposit-method">Paid by</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="deposit-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="deposit-reference">Reference</Label>
            <Input
              id="deposit-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Check number, auth code, last four…"
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <ACTIONS.pay />
              {busy ? "Saving…" : "Take deposit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
