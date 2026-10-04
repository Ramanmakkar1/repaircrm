"use client";

import * as React from "react";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import type { ProductOption } from "../types";
import {
  MAX_QUANTITY,
  centsToInput,
  parsePriceText,
  parseQuantityText,
  repairLabel,
  type BillKind,
  type BillLine,
  type LinePatch,
  type RepairOption,
} from "./flow";

/**
 * The small windows the bill builder opens: a one-off item, "edit this item",
 * "which unit?" and "from repair".
 *
 * They are drawn OUTSIDE the builder's <form> (the builder renders them next to
 * it), so nothing typed here posts and no Enter in here can reach the form. The
 * builder posts only what its own state holds. On a phone each one is the usual
 * bottom sheet (app/globals.css).
 */

/** The native picker: a phone shows its own big wheel, a counter tablet its own list. */
export const SELECT_CLASS =
  "h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-foreground outline-none transition-colors focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20";

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

/** A 48px row with a real checkbox: "Charge tax on this item". */
function TaxRow({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md bg-surface-hover px-4 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="text-[15px] font-medium text-foreground">Charge tax on this item</span>
    </label>
  );
}

/**
 * The scrolling list of tap-to-pick rows in "Which unit?" and "From repair".
 *
 * `grid-cols-[minmax(0,1fr)]` is what lets a long row shrink to the window: a bare `grid` makes its
 * one column `auto`, which never goes narrower than its widest row, so a long repair title ran
 * 575px wide in a 348px list (a sideways scrollbar, no ellipsis). The `p-1` (with `-m-1`, so the
 * rows still line up with the text above) leaves room inside the scroller for the 2px focus ring.
 */
export const PICK_LIST_CLASS = "-m-1 grid max-h-[50dvh] grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto p-1";

function submitOnEnter(submit: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submit();
  };
}

// ---------------------------------------------------------------------------
// One-off item
// ---------------------------------------------------------------------------

export function OneOffDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: { description: string; unitPriceCents: number; taxable: boolean }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <OneOffBody onAdd={(item) => { onAdd(item); onOpenChange(false); }} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Its own component so the fields start empty every time the window opens. */
function OneOffBody({
  onAdd,
  onCancel,
}: {
  onAdd: (item: { description: string; unitPriceCents: number; taxable: boolean }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [taxable, setTaxable] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (!description.trim()) return setError("Say what this item is for.");
    const unitPriceCents = price.trim() === "" ? 0 : parsePriceText(price);
    if (unitPriceCents === null) return setError("Enter a price like 12.50. Use a minus for a discount.");
    onAdd({ description: description.trim(), unitPriceCents, taxable });
  };

  return (
    <div className="grid gap-4" onKeyDown={submitOnEnter(submit)}>
      <DialogHeader>
        <DialogTitle>One-off item</DialogTitle>
        <DialogDescription>Something not in the catalogue: a bench fee, a salvaged part. Type a minus price for a discount.</DialogDescription>
      </DialogHeader>
      <Problem message={error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="bill-oneoff-name" className="text-[15px]">What is it?</Label>
        <Input
          id="bill-oneoff-name"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Bench fee"
          className="h-12"
          autoFocus
          maxLength={500}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bill-oneoff-price" className="text-[15px]">Price</Label>
        <Input
          id="bill-oneoff-price"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="h-12 text-right text-lg font-bold tabular-nums"
        />
      </div>
      <TaxRow checked={taxable} onChange={setTaxable} />
      <DialogFooter>
        <Button type="button" variant="outline" className="h-12 px-5" onClick={onCancel}>Cancel</Button>
        <Button type="button" className="h-12 px-6" onClick={submit}>Add item</Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit one item
// ---------------------------------------------------------------------------

export function LineDialog({
  line,
  product,
  kind,
  units,
  onSave,
  onRemove,
  onClose,
}: {
  /** The line being edited; null keeps the window shut. */
  line: BillLine | null;
  product: ProductOption | undefined;
  kind: BillKind;
  /** The units a serialized line can take (its own plus those in stock and not on this bill), or null. */
  units: string[] | null;
  onSave: (patch: LinePatch) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        {line ? <LineBody key={line.key} line={line} kind={kind} units={units} serialized={Boolean(product?.serialized)} onSave={(patch) => { onSave(patch); onClose(); }} onRemove={() => { onRemove(); onClose(); }} onCancel={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LineBody({
  line,
  kind,
  units,
  serialized,
  onSave,
  onRemove,
  onCancel,
}: {
  line: BillLine;
  kind: BillKind;
  units: string[] | null;
  serialized: boolean;
  onSave: (patch: LinePatch) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = React.useState(line.description);
  const [quantity, setQuantity] = React.useState(String(line.quantity));
  const [price, setPrice] = React.useState(centsToInput(line.unitPriceCents));
  const [taxable, setTaxable] = React.useState(line.taxable);
  const [serial, setSerial] = React.useState(line.serial);
  const [error, setError] = React.useState<string | null>(null);
  const oneUnit = kind === "invoice" && serialized;

  const submit = () => {
    if (!description.trim()) return setError("Say what this item is for.");
    const quantityValue = oneUnit ? 1 : parseQuantityText(quantity);
    if (quantityValue === null) return setError(`The quantity is a whole number from 1 to ${MAX_QUANTITY.toLocaleString("en-US")}.`);
    const unitPriceCents = parsePriceText(price);
    if (unitPriceCents === null) return setError("Enter a price like 12.50. Use a minus for a discount.");
    if (oneUnit && !serial.trim()) return setError("Choose which unit you are selling.");
    onSave({
      description: description.trim(),
      quantity: quantityValue,
      unitPriceCents,
      taxable,
      ...(kind === "invoice" ? { serial: serial.trim() } : {}),
    });
  };

  return (
    <div className="grid gap-4" onKeyDown={submitOnEnter(submit)}>
      <DialogHeader>
        <DialogTitle>Edit item</DialogTitle>
        <DialogDescription>Change the wording, how many, the price or the tax for this item.</DialogDescription>
      </DialogHeader>
      <Problem message={error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="bill-line-name" className="text-[15px]">What is it?</Label>
        <Input id="bill-line-name" value={description} onChange={(event) => setDescription(event.target.value)} className="h-12" maxLength={500} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bill-line-qty" className="text-[15px]">How many</Label>
          {oneUnit ? (
            <p id="bill-line-qty" className="flex h-12 items-center rounded-md bg-surface-hover px-3 text-base text-muted-foreground">1 unit</p>
          ) : (
            <Input id="bill-line-qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" className="h-12 text-right text-lg font-bold tabular-nums" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bill-line-price" className="text-[15px]">Price each</Label>
          <Input id="bill-line-price" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" className="h-12 text-right text-lg font-bold tabular-nums" />
        </div>
      </div>
      <TaxRow checked={taxable} onChange={setTaxable} />
      {kind === "invoice" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="bill-line-serial" className="text-[15px]">Serial number{serialized ? "" : " (optional)"}</Label>
          {units ? (
            <select id="bill-line-serial" value={serial} onChange={(event) => setSerial(event.target.value)} className={SELECT_CLASS}>
              <option value="" disabled={oneUnit}>{units.length === 0 ? "No units in stock" : "Pick a unit"}</option>
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          ) : (
            <Input id="bill-line-serial" value={serial} onChange={(event) => setSerial(event.target.value)} className="h-12" maxLength={120} />
          )}
        </div>
      ) : null}
      <DialogFooter className="flex-wrap justify-between">
        <Button type="button" variant="ghost" className="h-12 px-4 text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 aria-hidden /> Remove item
        </Button>
        <span className="flex items-center gap-2.5">
          <Button type="button" variant="outline" className="h-12 px-5" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="h-12 px-6" onClick={submit}>Done</Button>
        </span>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Which unit?
// ---------------------------------------------------------------------------

/** The units to tap. A serial is read in full, so a long one wraps rather than being cut. */
export function UnitList({ units, onPick }: { units: string[]; onPick: (serial: string) => void }) {
  return (
    <ul className={PICK_LIST_CLASS}>
      {units.map((unit) => (
        <li key={unit} className="min-w-0">
          <button
            type="button"
            onClick={() => onPick(unit)}
            className="flex min-h-14 w-full items-center rounded-xl border border-border bg-surface px-4 py-2 text-left font-mono text-base font-semibold [overflow-wrap:anywhere] transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {unit}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function UnitDialog({
  product,
  units,
  onPick,
  onClose,
}: {
  /** The serialized product waiting on an answer; null keeps the window shut. */
  product: ProductOption | null;
  units: string[];
  onPick: (serial: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={product !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which unit?</DialogTitle>
          <DialogDescription>
            {product ? `${product.name} is sold by serial number. Tap the unit you are handing over.` : ""}
          </DialogDescription>
        </DialogHeader>
        <UnitList units={units} onPick={onPick} />
        {units.length === 0 ? <p className="text-sm text-muted-foreground">No more units in stock.</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-12 px-5" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// From repair
// ---------------------------------------------------------------------------

/** This customer's open repairs to tap; the one linked now is ticked. A long title stops at two lines. */
export function RepairList({ repairs, currentId, onPick }: { repairs: RepairOption[]; currentId: string; onPick: (id: string) => void }) {
  return (
    <ul className={PICK_LIST_CLASS}>
      {repairs.map((repair) => {
        const current = repair.id === currentId;
        return (
          <li key={repair.id} className="min-w-0">
            <button
              type="button"
              aria-pressed={current}
              onClick={() => onPick(repair.id)}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-surface px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                current ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{repairLabel(repair)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {repair.status}
                  {repair.charges && repair.charges.length > 0
                    ? ` · ${repair.charges.length} ${repair.charges.length === 1 ? "charge" : "charges"} to bill`
                    : repair.charges
                      ? " · nothing left to bill"
                      : ""}
                </span>
              </span>
              {current ? <Check aria-hidden className="size-5 shrink-0" strokeWidth={3} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RepairDialog({
  open,
  repairs,
  currentId,
  onPick,
  onUnlink,
  onOpenChange,
}: {
  open: boolean;
  repairs: RepairOption[];
  currentId: string;
  onPick: (id: string) => void;
  onUnlink: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>From repair</DialogTitle>
          <DialogDescription>
            Pick one of this customer&rsquo;s open repairs. Anything charged on it and not billed yet goes on this bill, and the repair shows it as billed once you save.
          </DialogDescription>
        </DialogHeader>
        <RepairList repairs={repairs} currentId={currentId} onPick={(id) => { onPick(id); onOpenChange(false); }} />
        <DialogFooter className="flex-wrap justify-between">
          {currentId ? (
            <Button type="button" variant="ghost" className="h-12 px-4" onClick={() => { onUnlink(); onOpenChange(false); }}>
              Not for a repair
            </Button>
          ) : <span />}
          <Button type="button" variant="outline" className="h-12 px-5" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
