"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus } from "lucide-react";
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
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";

/** One row of the audit trail, as the customer hub loads it. */
export type CreditHistoryItem = {
  id: string;
  deltaCents: number;
  reason: string;
  /** Who made the adjustment; null when that staff account was removed. */
  userName: string | null;
  createdAt: string;
};

/**
 * Add or remove store credit from the customer hub.
 *
 * The current balance is the loudest thing in the dialog on purpose: "add $20"
 * is a meaningless instruction without knowing what is already on file, and a
 * front-desk mistake here is real money.
 *
 * Under the form sits the recent history, for the same reason: "why is there
 * $40 on this account?" is the question the front desk actually gets asked, and
 * answering it should not require opening a database.
 */
export function CreditDialog({
  customerId,
  customerName,
  balanceCents,
  history,
}: {
  customerId: string;
  customerName: string;
  balanceCents: number;
  history: CreditHistoryItem[];
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
          <ICONS.credit />
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
                    <ACTIONS.add className="size-4" />
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
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Saving…" : direction === "add" ? "Add credit" : "Remove credit"}
            </Button>
          </DialogFooter>
        </form>

        <CreditHistory history={history} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The audit trail, newest first.
 *
 * Deliberately no running balance column: credit is also spent at checkout
 * through the CREDIT payment method, which does not write rows here, so a
 * running total computed from these deltas alone would disagree with the
 * balance above and look like a bug. The heading says "adjustments" for the
 * same reason — it is honest about what it covers.
 */
function CreditHistory({ history }: { history: CreditHistoryItem[] }) {
  if (history.length === 0) {
    return (
      <p className="border-t border-border pt-4 text-[13px] text-muted-foreground">
        No adjustments recorded yet.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recent adjustments
      </h3>
      <ul className="flex max-h-52 flex-col gap-3 overflow-y-auto pr-1">
        {history.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13.5px] font-semibold text-foreground">
                {entry.reason}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {formatStamp(entry.createdAt)}
                {entry.userName ? ` · ${entry.userName}` : ""}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 text-[14px] font-bold tabular-nums",
                entry.deltaCents < 0
                  ? "text-destructive"
                  : "text-status-resolved-fg",
              )}
            >
              {entry.deltaCents > 0 ? "+" : ""}
              {formatCents(entry.deltaCents)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatStamp(iso: string): string {
  return STAMP.format(new Date(iso));
}
