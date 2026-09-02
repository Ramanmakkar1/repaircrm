"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Percent, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteTaxRateAction,
  saveTaxRateAction,
} from "@/app/(app)/settings/tax-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { formatBps } from "@/lib/money";
import type { TaxRateOption } from "@/lib/tax";

/**
 * The shop's named sales-tax rates.
 *
 * Most shops need exactly one, which is why this card sits below the plain
 * "Sales tax rate" box rather than replacing it: the starred rate here IS that
 * box's number (the server mirrors it back), so a single-rate shop can ignore
 * this card entirely and nothing changes for them.
 *
 * Rendered outside the shop form on purpose — a form inside a form is invalid
 * HTML, and these rows save one at a time rather than with the rest of the
 * page.
 */
export function TaxRatesCard({ rates }: { rates: TaxRateOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<TaxRateOption | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [removing, setRemoving] = React.useState<TaxRateOption | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function remove(rate: TaxRateOption) {
    setBusy(true);
    const result = await deleteTaxRateAction(rate.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${rate.name}" removed.`);
    setRemoving(null);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Tax rates</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add rate
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {rates.length === 0 ? (
            <EmptyState
              icon={Percent}
              title="One rate for the whole shop"
              hint="Add a named rate — GST, PST, out-of-state — when different customers are taxed differently. The rate above keeps applying until you do."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rates.map((rate) => (
                <li
                  key={rate.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <button
                    type="button"
                    onClick={() => setEditing(rate)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Star
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        rate.isDefault
                          ? "fill-accent text-accent"
                          : "text-faint-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-[14.5px] font-semibold",
                        rate.active ? "text-foreground" : "text-faint-foreground",
                      )}
                    >
                      {rate.name}
                    </span>
                    {rate.isDefault ? (
                      <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">
                        Default
                      </span>
                    ) : null}
                    {!rate.active ? (
                      <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </button>
                  <span className="shrink-0 text-[14.5px] font-semibold tabular-nums text-muted-foreground">
                    {formatBps(rate.rateBps)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${rate.name}`}
                    className="text-faint-foreground hover:bg-destructive-soft hover:text-destructive"
                    onClick={() => setRemoving(rate)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
            The starred rate is what new documents use, and it is the same number
            as the sales tax rate above. A customer can be pinned to a different
            rate, or marked tax exempt, on their own record.
          </p>
        </CardContent>
      </Card>

      <TaxRateDialog
        // Keyed on the row being edited so each open mounts with fresh values.
        key={editing?.id ?? (creating ? "new" : "idle")}
        open={creating || editing !== null}
        rate={editing}
        firstRate={rates.length === 0}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <Dialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{removing?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Documents already raised keep the rate they were taxed at — this
              only removes the option for new ones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && remove(removing)}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 825 -> "8.25", the percentage a human types. */
function bpsToPercentInput(bps: number): string {
  return String(Math.round(bps) / 100);
}

function TaxRateDialog({
  open,
  rate,
  firstRate,
  onClose,
}: {
  open: boolean;
  rate: TaxRateOption | null;
  /** True when this shop has no rates yet — explains the seeded "Default" row. */
  firstRate: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState(rate?.name ?? "");
  const [percent, setPercent] = React.useState(
    rate ? bpsToPercentInput(rate.rateBps) : "",
  );
  const [isDefault, setIsDefault] = React.useState(rate?.isDefault ?? false);
  const [active, setActive] = React.useState(rate?.active ?? true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveTaxRateAction({
      id: rate?.id ?? null,
      name,
      rate: percent,
      isDefault,
      active,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(rate ? "Tax rate updated." : "Tax rate added.");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{rate ? "Edit tax rate" : "New tax rate"}</DialogTitle>
          <DialogDescription>
            {rate
              ? "Documents already raised keep the rate they were taxed at."
              : firstRate
                ? "Your current shop rate is kept as a “Default” rate alongside this one."
                : "New estimates, invoices and sales can be taxed at this rate."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-name">Name</Label>
            <Input
              id="tax-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="GST"
              maxLength={60}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-rate">Rate</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="tax-rate"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                inputMode="decimal"
                placeholder="5"
                className="w-28 text-right tabular-nums"
              />
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            </div>
          </div>

          <label className="flex items-start gap-2.5">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(next) => setIsDefault(next === true)}
              aria-label="Use as the shop default"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-foreground">
                Shop default
              </span>
              <span className="text-[13px] text-muted-foreground">
                What new documents use when the customer has no rate of their own.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5">
            <Checkbox
              checked={active}
              onCheckedChange={(next) => setActive(next === true)}
              aria-label="Available on new documents"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-foreground">
                Active
              </span>
              <span className="text-[13px] text-muted-foreground">
                Uncheck to retire it without touching old documents.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : rate ? "Save changes" : "Add rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
