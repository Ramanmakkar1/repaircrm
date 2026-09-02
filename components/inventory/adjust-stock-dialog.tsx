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
import { parseSerialList } from "@/lib/serials";
import { STOCK_REASONS, signedQty } from "./format";

type Mode = "delta" | "count";
type Direction = "add" | "remove";

/** One unit currently on the shelf, for the "which ones left?" picker. */
export type SerialOption = { id: string; serial: string };

const EMPTY: InventoryActionState = {};

/**
 * Move a product's stock, with a reason.
 *
 * Two ways in for a countable product, because shops think in both: "three more
 * arrived" (a change) and "I counted the shelf and there are nine" (a level).
 * The count path sends the counted number and lets the server derive the delta
 * against the level it reads inside the transaction — deriving it here would
 * bake in whatever the page was rendered with, which may be minutes stale.
 *
 * A SERIALIZED product gets neither. Its level is the count of units in stock,
 * so the question is not "how many" but "which": adding means pasting the
 * serials that arrived, removing means ticking the units that left. There is no
 * "counted total" mode at all — a number can't say which handset is missing.
 */
export function AdjustStockDialog({
  productId,
  stockQty,
  serialized = false,
  serials = [],
  trigger,
}: {
  productId: string;
  stockQty: number;
  /** True when every unit is a ProductSerial row. */
  serialized?: boolean;
  /** The IN_STOCK units, for the remove picker. */
  serials?: SerialOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("delta");
  const [direction, setDirection] = React.useState<Direction>("add");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState<string>("Received");
  const [note, setNote] = React.useState("");
  const [pasted, setPasted] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);

  const reset = () => {
    setAmount("");
    setNote("");
    setPasted("");
    setPicked([]);
  };

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
        reset();
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

  // For a serialized product the change is however many units are on the list.
  const serialDelta =
    direction === "add" ? parseSerialList(pasted).length : -picked.length;
  const serialReady = serialDelta !== 0;

  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
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
          <input type="hidden" name="mode" value={serialized ? "delta" : mode} />
          {serialized ? (
            <input type="hidden" name="direction" value={direction} />
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-hover p-1">
            {(serialized
              ? ([
                  { value: "add", label: "Add units" },
                  { value: "remove", label: "Remove units" },
                ] as const)
              : ([
                  { value: "delta", label: "Add / remove" },
                  { value: "count", label: "Set counted total" },
                ] as const)
            ).map((option) => {
              const active = serialized
                ? direction === option.value
                : mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (serialized) setDirection(option.value as Direction);
                    else setMode(option.value as Mode);
                    reset();
                  }}
                  aria-pressed={active}
                  className={cn(
                    "h-9 rounded-sm text-[13.5px] font-semibold transition-colors",
                    active
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          {serialized ? (
            direction === "add" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="stock-serials">Serial numbers — one per line</Label>
                <Textarea
                  id="stock-serials"
                  name="serials"
                  rows={5}
                  autoFocus
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                  placeholder={"SN-0001\nSN-0002"}
                  className="font-mono text-[13px]"
                />
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {stockQty} →{" "}
                  <strong className="font-semibold text-foreground">
                    {stockQty + parseSerialList(pasted).length}
                  </strong>{" "}
                  ({signedQty(parseSerialList(pasted).length)})
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Which units left the shelf?</Label>
                {serials.length === 0 ? (
                  <p className="rounded-md border border-border bg-surface-hover px-3.5 py-3 text-[13px] text-muted-foreground">
                    Nothing is in stock for this product right now.
                  </p>
                ) : (
                  <div className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {serials.map((unit) => (
                      <label
                        key={unit.id}
                        className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <input
                          type="checkbox"
                          name="serialIds"
                          value={unit.id}
                          checked={picked.includes(unit.id)}
                          onChange={() => togglePick(unit.id)}
                          className="size-4 shrink-0 accent-current"
                        />
                        <span className="font-mono text-[13px] text-foreground">
                          {unit.serial}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {stockQty} →{" "}
                  <strong className="font-semibold text-foreground">
                    {stockQty - picked.length}
                  </strong>{" "}
                  ({signedQty(-picked.length)})
                </p>
              </div>
            )
          ) : (
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
                    {stockQty} →{" "}
                    <strong className="font-semibold text-foreground">
                      {resulting}
                    </strong>{" "}
                    ({signedQty(delta)})
                  </>
                )}
              </p>
            </div>
          )}

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
            <Button type="submit" disabled={pending || (serialized && !serialReady)}>
              {pending ? "Saving…" : "Save adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
