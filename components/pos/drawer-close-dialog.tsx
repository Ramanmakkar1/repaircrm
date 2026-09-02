"use client";

import * as React from "react";
import { Calculator, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseCents } from "@/lib/money";
import {
  closeDrawerAction,
  getDrawerSummaryAction,
} from "@/app/(app)/pos/drawers/actions";
import {
  DRAWER_DENOMINATIONS,
  DRAWER_VERDICT_CLASS,
  drawerVerdict,
  type DrawerSummary,
} from "./drawer-types";

/**
 * "Close drawer" — count the till, see the difference, write down why.
 *
 * The expected total is fetched when the dialog OPENS, not baked into the page:
 * a counter can sit on /pos for hours taking sales, and a figure computed at
 * page load would be stale by the time anyone counts.
 *
 * The bill/coin counter is the point of the screen. Nobody closing a till has a
 * total in their head — they have stacks of twenties. Typing a raw figure is
 * still allowed for the shop that counts on a machine, and the two stay in sync:
 * touching the counter overwrites the figure.
 */
export function DrawerCloseDialog({
  drawerId,
  onClosed,
}: {
  drawerId: string;
  onClosed: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<DrawerSummary | null>(null);
  const [counts, setCounts] = React.useState<Record<number, string>>({});
  const [manual, setManual] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // The expected total is fetched in the OPEN handler rather than an effect:
  // it is a response to a press, not a subscription to anything.
  function openDialog() {
    setSummary(null);
    setCounts({});
    setManual("");
    setNote("");
    setOpen(true);

    void getDrawerSummaryAction(drawerId).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setSummary(result.summary);
    });
  }

  const countedFromDenominations = DRAWER_DENOMINATIONS.reduce((sum, denom) => {
    const quantity = Number.parseInt(counts[denom.cents] ?? "", 10);
    return sum + (Number.isFinite(quantity) ? Math.max(0, quantity) * denom.cents : 0);
  }, 0);

  const usingCounter = Object.values(counts).some((value) => value.trim() !== "");
  const countedCents = usingCounter ? countedFromDenominations : parseCents(manual);

  const expected = summary?.expectedCents ?? 0;
  const difference = countedCents - expected;
  const verdict = drawerVerdict(difference);

  async function submit() {
    setBusy(true);
    const result = await closeDrawerAction(drawerId, { countedCents, note });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    onClosed();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={openDialog}>
          <LockKeyhole className="size-4" />
          Close drawer
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close the drawer</DialogTitle>
          <DialogDescription>
            Count what&rsquo;s in the till. The difference is recorded either
            way — a short drawer nobody wrote down is a short drawer nobody can
            explain tomorrow.
          </DialogDescription>
        </DialogHeader>

        {summary === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Adding up the day&rsquo;s cash…
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ------------------------------------------------- expected -- */}
            <div className="rounded-lg border border-border bg-surface-hover px-4 py-3.5">
              <dl className="flex flex-col gap-1.5 text-[13.5px]">
                <Line label="Opening float" cents={summary.openingCents} />
                <Line
                  label={`Cash sales (${summary.paymentsCount})`}
                  cents={summary.paymentsCents}
                />
                <Line
                  label={`Cash deposits (${summary.depositsCount})`}
                  cents={summary.depositsCents}
                />
                <Line
                  label={`Cash refunds (${summary.refundsCount})`}
                  cents={-summary.refundsCents}
                />
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-[15px] font-bold">
                  <dt>Expected in the till</dt>
                  <dd className="font-mono tabular-nums">
                    {formatCents(summary.expectedCents)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* -------------------------------------------------- counter -- */}
            <div className="flex flex-col gap-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
                <Calculator className="size-3.5" />
                Count it
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {DRAWER_DENOMINATIONS.map((denom) => (
                  <label key={denom.cents} className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-muted-foreground">
                      {denom.label}
                    </span>
                    <Input
                      inputMode="numeric"
                      value={counts[denom.cents] ?? ""}
                      placeholder="0"
                      onChange={(event) =>
                        setCounts((prev) => ({
                          ...prev,
                          [denom.cents]: event.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      className="h-9 text-center"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="drawer-counted">Counted total</Label>
              <Input
                id="drawer-counted"
                inputMode="decimal"
                value={usingCounter ? (countedFromDenominations / 100).toFixed(2) : manual}
                readOnly={usingCounter}
                placeholder="0.00"
                onChange={(event) => setManual(event.target.value)}
              />
              <p className="text-[12.5px] text-muted-foreground">
                {usingCounter
                  ? "Adding up from the counter above. Clear the boxes to type a total instead."
                  : "Or fill in the bills and coins above and this fills itself in."}
              </p>
            </div>

            {/* ------------------------------------------------ difference -- */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-4 py-3",
                DRAWER_VERDICT_CLASS[verdict],
              )}
            >
              <span className="text-[14px] font-bold">
                {verdict === "balanced"
                  ? "Balanced"
                  : verdict === "over"
                    ? "Over"
                    : "Short"}
              </span>
              <span className="font-mono text-[17px] font-bold tabular-nums">
                {difference > 0 ? "+" : ""}
                {formatCents(difference)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="drawer-note">Note</Label>
              <Textarea
                id="drawer-note"
                rows={2}
                maxLength={500}
                value={note}
                placeholder="Gave change from the safe at lunchtime."
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || summary === null}>
            {busy ? "Closing…" : "Close drawer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{formatCents(cents)}</dd>
    </div>
  );
}
