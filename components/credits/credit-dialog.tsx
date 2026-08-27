"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { adjustCustomerCreditAction } from "@/app/(app)/customers/credit-actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/**
 * Add or remove store credit from the customer hub.
 *
 * The current balance is the loudest thing in the dialog on purpose: "add $20"
 * is a meaningless instruction without knowing what is already on file, and a
 * front-desk mistake here is real money.
 */
export function CreditDialog({
  customerId,
  customerName,
  balanceCents,
}: {
  customerId: string;
  customerName: string;
  balanceCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState<"add" | "remove">("add");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setDirection("add");
    setAmount("");
    setReason("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await adjustCustomerCreditAction({
      customerId,
      direction,
      amount,
      reason,
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
        <Button variant="outline">
          <Wallet />
          Add Credit
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Store credit</DialogTitle>
          <DialogDescription>
            Money held on account for {customerName}, spendable at checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-hover px-4 py-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current balance
          </span>
          <span className="text-[34px] font-bold leading-none tabular-nums tracking-tight text-foreground">
            {formatCents(balanceCents)}
          </span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(["add", "remove"] as const).map((option) => {
              const active = direction === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDirection(option)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border text-[13.5px] font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                      : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  {option === "add" ? (
                    <Plus className="size-4" />
                  ) : (
                    <Minus className="size-4" />
                  )}
                  {option === "add" ? "Add credit" : "Remove credit"}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-amount">Amount</Label>
            <Input
              id="credit-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="text-right tabular-nums"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-reason">Reason</Label>
            <Input
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Deposit for screen order"
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
              {busy ? "Saving…" : direction === "add" ? "Add credit" : "Remove credit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
