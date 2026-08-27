"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

import {
  adjustStockAction,
  type InventoryActionState,
} from "@/app/(app)/inventory/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STOCK_REASONS, signedQty } from "./format";

type Mode = "delta" | "count";

const EMPTY: InventoryActionState = {};

/**
 * Move a product's stock, with a reason.
 *
 * Two ways in, because shops think in both: "three more arrived" (a change)
 * and "I counted the shelf and there are nine" (a level). The count path sends
 * the counted number and lets the server derive the delta against the level it
 * reads inside the transaction — deriving it here would bake in whatever the
 * page was rendered with, which may be minutes stale.
 */
export function AdjustStockDialog({
  productId,
  stockQty,
  trigger,
}: {
  productId: string;
  stockQty: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("delta");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState<string>("Received");
  const [note, setNote] = React.useState("");

  // Closing/resetting happens as part of the submit rather than in an effect
  // watching `state`, so it fires exactly once per successful save.
  const [state, formAction, pending] = useActionState(
    async (
      previous: InventoryActionState,
      formData: FormData,
    ): Promise<InventoryActionState> => {
      const result = await adjustStockAction(productId, previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Stock adjusted");
        setAmount("");
        setNote("");
      }
      return result;
    },
    EMPTY,
  );

  const parsed = Number.parseInt(amount, 10);
  const valid = Number.isFinite(parsed);
  const resulting = !valid
    ? null
    : mode === "count"
      ? Math.max(parsed, 0)
      : stockQty + parsed;
  const delta = resulting == null ? null : resulting - stockQty;

  const bump = (by: number) => {
    const base = Number.isFinite(parsed) ? parsed : mode === "count" ? stockQty : 0;
    setAmount(String(base + by));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Every change is recorded against this product with who made it and
            why.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="mode" value={mode} />

          <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-hover p-1">
            {(
              [
                { value: "delta", label: "Add / remove" },
                { value: "count", label: "Set counted total" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setMode(option.value);
                  setAmount("");
                }}
                aria-pressed={mode === option.value}
                className={cn(
                  "h-9 rounded-sm text-[13.5px] font-semibold transition-colors",
                  mode === option.value
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {state.error ? (
            <p
              role="alert"
              className="text-[13px] font-medium text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="stock-amount">
              {mode === "count" ? "Counted on the shelf" : "Change"}
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => bump(-1)}
                aria-label="Decrease"
              >
                <Minus />
              </Button>
              <Input
                id="stock-amount"
                name="amount"
                type="number"
                step={1}
                min={mode === "count" ? 0 : undefined}
                inputMode="numeric"
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={mode === "count" ? String(stockQty) : "+1"}
                className="text-center text-base font-bold tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => bump(1)}
                aria-label="Increase"
              >
                <Plus />
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {resulting == null || delta === null ? (
                <>
                  On hand now: <strong className="font-semibold">{stockQty}</strong>
                </>
              ) : (
                <>
                  {stockQty} → <strong className="font-semibold text-foreground">{resulting}</strong>{" "}
                  ({signedQty(delta)})
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="stock-reason">Reason</Label>
            <input type="hidden" name="reason" value={reason} />
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="stock-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="stock-note">Note</Label>
            <Textarea
              id="stock-note"
              name="note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional — PO number, supplier, who dropped it…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
