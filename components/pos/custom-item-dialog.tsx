"use client";

import * as React from "react";
import { Plus } from "lucide-react";

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
import { parseCents } from "@/lib/money";

/**
 * "One-off item" — the escape hatch for anything not in the catalogue: a
 * salvaged part, a bench fee, a cable out of the parts bin.
 *
 * A custom line is the one place the client's price is the real price (there is
 * no catalogue row to check it against), so the server clamps it to >= 0 and
 * caps the description. Nothing here touches stock: an item with no product row
 * has nothing to decrement.
 */
export function CustomItemDialog({
  onAdd,
}: {
  onAdd: (item: { name: string; unitPriceCents: number; taxable: boolean }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [taxable, setTaxable] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName("");
    setPrice("");
    setTaxable(true);
    setError(null);
  };

  const onOpenChange = (next: boolean) => {
    if (next) reset();
    setOpen(next);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const description = name.trim();
    if (!description) {
      setError("Give this item a description.");
      return;
    }
    const unitPriceCents = parseCents(price);
    if (unitPriceCents < 0) {
      setError("A price cannot be negative.");
      return;
    }
    onAdd({ name: description, unitPriceCents, taxable });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-12 w-full justify-start">
          <Plus />
          One-off item
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>One-off item</DialogTitle>
          <DialogDescription>
            Something not in the catalogue. It goes on the receipt but never
            touches stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-name">Description</Label>
            <Input
              id="custom-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Salvaged charging cable"
              className="h-12"
              autoFocus
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-price">Price</Label>
            <Input
              id="custom-price"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-12 text-right text-lg font-bold tabular-nums"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-md bg-surface-hover px-4 py-3">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(event) => setTaxable(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="text-[14px] font-medium text-foreground">
              Charge sales tax on this item
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add to cart</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
