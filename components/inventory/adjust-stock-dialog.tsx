"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Check, Minus, Plus } from "lucide-react";

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
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { parseSerialList } from "@/lib/serials";
import { SerialScanField } from "./serial-scan-field";
import { REASON_TILES, stockChangeWords } from "./stock-words";

type Mode = "delta" | "count";
type Direction = "add" | "remove";

/** One unit currently on the shelf, for the "which ones left?" picker. */
export type SerialOption = { id: string; serial: string };

const EMPTY: InventoryActionState = {};

/** Quick amounts for a box of screen guards: one tap instead of ten. */
const QUICK = [1, 5, 10];

const BIG_STEP =
  "flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-hover active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Change a product's stock, with a reason.
 *
 * Two ways in for a countable product, because shops think in both: "three more
 * arrived" (add or take off) and "I counted the shelf and there are nine" (a
 * level). The count path sends the counted number and lets the server derive
 * the change against the level it reads inside the transaction — deriving it
 * here would bake in whatever the page was rendered with, which may be stale.
 *
 * Touch first: the result is a big "2 → 3", the minus and plus are 64px, quick
 * chips add 1, 5 or 10, the reason is a row of big tiles in plain words, and a
 * note waits behind "Add a note". The number box is text with a number
 * keyboard, never a fiddly native spinner.
 *
 * A SERIALIZED product gets neither mode. Its level is the count of units in
 * stock, so the question is not "how many" but "which": adding means scanning
 * the serials that arrived, removing means tapping the units that left.
 */
export function AdjustStockDialog({
  productId,
  productName,
  stockQty,
  serialized = false,
  serials = [],
  trigger,
  initialDelta,
}: {
  productId: string;
  /** Shown under the title, so it is clear which product is changing. */
  productName?: string;
  stockQty: number;
  /** True when every unit is a ProductSerial row. */
  serialized?: boolean;
  /** The IN_STOCK units, for the remove picker. */
  serials?: SerialOption[];
  trigger: React.ReactNode;
  initialDelta?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("delta");
  const [direction, setDirection] = React.useState<Direction>("add");
  const [amount, setAmount] = React.useState(initialDelta == null ? "" : String(initialDelta));
  const [reason, setReason] = React.useState<string>("Received");
  const [note, setNote] = React.useState("");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);

  const reset = (next: { mode?: Mode } = {}) => {
    const nextMode = next.mode ?? "delta";
    setMode(nextMode);
    setAmount(nextMode === "count" ? String(stockQty) : initialDelta == null ? "" : String(initialDelta));
    setReason(nextMode === "count" ? "Counted" : initialDelta != null && initialDelta < 0 ? "Other" : "Received");
    setNote("");
    setNoteOpen(false);
    setPasted("");
    setPicked([]);
  };

  // Closing/resetting happens as part of the submit rather than in an effect
  // watching `state`, so it fires exactly once per successful save.
  const [state, formAction] = useActionState(
    async (
      previous: InventoryActionState,
      formData: FormData,
    ): Promise<InventoryActionState> => {
      const result = await adjustStockAction(productId, previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Stock updated.");
        reset();
      }
      return result;
    },
    EMPTY,
  );

  const parsed = Number.parseInt(amount, 10);
  const valid = Number.isFinite(parsed);
  const resulting = !valid ? null : mode === "count" ? Math.max(parsed, 0) : stockQty + parsed;

  const bump = (by: number) => {
    const base = Number.isFinite(parsed) ? parsed : mode === "count" ? stockQty : 0;
    setAmount(String(base + by));
  };

  // For a serialized product the change is however many units are on the list.
  const added = parseSerialList(pasted).length;
  const serialDelta = direction === "add" ? added : -picked.length;
  const serialReady = serialDelta !== 0;
  const preview = serialized
    ? stockChangeWords(stockQty, stockQty + serialDelta)
    : resulting == null
      ? null
      : stockChangeWords(stockQty, resulting);

  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const modes = serialized
    ? ([
        { value: "add", label: "Add units" },
        { value: "remove", label: "Remove units" },
      ] as const)
    : ([
        { value: "delta", label: "Add or take off" },
        { value: "count", label: "I counted the shelf" },
      ] as const);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
          setDirection("add");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Change stock</DialogTitle>
          <DialogDescription className="text-[15px]">
            {productName ? `${productName}. ` : ""}Every change is kept in the product&rsquo;s stock history.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="mode" value={serialized ? "delta" : mode} />
          {serialized ? <input type="hidden" name="direction" value={direction} /> : null}
          <input type="hidden" name="reason" value={reason} />

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-hover p-1">
            {modes.map((option) => {
              const active = serialized ? direction === option.value : mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (serialized) {
                      setDirection(option.value as Direction);
                      reset();
                      setReason(option.value === "remove" ? "Other" : "Received");
                    } else {
                      reset({ mode: option.value as Mode });
                    }
                  }}
                  aria-pressed={active}
                  className={cn(
                    "min-h-12 rounded-xl px-2 text-[15px] font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {state.error ? (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          {/* The result first, big: what the shelf will say after Save. */}
          <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-border py-3" aria-live="polite">
            <span className="rf-num text-4xl font-semibold tabular-nums tracking-tight">{preview ? preview.line : `${stockQty} on the shelf`}</span>
            <span className="text-[15px] text-muted-foreground">{preview ? preview.change : mode === "count" ? "Type what is on the shelf" : "Tap plus or minus"}</span>
          </div>

          {serialized ? (
            direction === "add" ? (
              <SerialScanField
                id="stock-serials"
                name="serials"
                label="Scan each unit that came in"
                value={pasted}
                onChange={setPasted}
              />
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-base font-semibold">Which units left the shelf?</legend>
                {serials.length === 0 ? (
                  <p className="rounded-xl border border-border bg-surface-hover px-4 py-3 text-[15px] text-muted-foreground">
                    Nothing is in stock for this product right now.
                  </p>
                ) : (
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {serials.map((unit) => {
                      const on = picked.includes(unit.id);
                      return (
                        <label
                          key={unit.id}
                          className={cn(
                            "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors",
                            on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-hover",
                          )}
                        >
                          <input
                            type="checkbox"
                            name="serialIds"
                            value={unit.id}
                            checked={on}
                            onChange={() => togglePick(unit.id)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-lg border-2",
                              on ? "border-accent bg-accent text-accent-foreground" : "border-border-strong",
                            )}
                          >
                            {on ? <Check className="size-4" strokeWidth={3} /> : null}
                          </span>
                          <span className="font-mono text-base font-semibold">{unit.serial}</span>
                          <span className="ml-auto text-[14px] text-muted-foreground">{on ? "Leaving" : "On the shelf"}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <Label htmlFor="stock-amount" className="text-base font-semibold">
                {mode === "count" ? "How many are on the shelf?" : "How many to add or take off?"}
              </Label>
              <div className="flex items-center gap-3">
                <button type="button" className={BIG_STEP} onClick={() => bump(-1)} aria-label="One less">
                  <Minus className="size-7" aria-hidden />
                </button>
                <Input
                  id="stock-amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9-]/g, ""))}
                  placeholder={mode === "count" ? String(stockQty) : "0"}
                  className="h-16 min-w-0 flex-1 rounded-2xl text-center text-3xl font-semibold tabular-nums"
                />
                <button type="button" className={BIG_STEP} onClick={() => bump(1)} aria-label="One more">
                  <Plus className="size-7" aria-hidden />
                </button>
              </div>
              {mode === "delta" ? (
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => bump(step)}
                      className="min-h-12 min-w-16 rounded-xl border border-border-strong bg-surface px-4 text-base font-semibold tabular-nums hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      +{step}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => bump(-1)}
                    className="min-h-12 min-w-16 rounded-xl border border-border-strong bg-surface px-4 text-base font-semibold tabular-nums hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    −1
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-semibold">Why?</legend>
            <div className="grid grid-cols-2 gap-2">
              {REASON_TILES.map((tile) => {
                const active = reason === tile.value;
                return (
                  <button
                    key={tile.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setReason(tile.value);
                      if (tile.value === "Other") setNoteOpen(true);
                    }}
                    className={cn(
                      "relative flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
                    )}
                  >
                    <span className="pr-6 text-[15px] font-semibold leading-tight">{tile.label}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{tile.hint}</span>
                    {active ? (
                      <span aria-hidden className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {noteOpen ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="stock-note" className="text-base font-semibold">
                Note
              </Label>
              <Textarea
                id="stock-note"
                name="note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Which supplier, who dropped it…"
                className="text-base"
              />
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-12 self-start px-4 text-[15px]" onClick={() => setNoteOpen(true)}>
              <Plus aria-hidden />
              Add a note
            </Button>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" className="h-12 px-5 text-base" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              disabled={serialized && !serialReady}
              pendingLabel="Saving…"
              className="h-12 px-6 text-base"
            >
              {preview && preview.change !== "No change" ? `Save: ${preview.line}` : "Save"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
