"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addPartOrderAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";

/**
 * A catalogue product the part picker can prefill from.
 *
 * `costCents` — what the SHOP pays — is the number that matters here, not the
 * retail price: ordering a part is a purchase. It is nullable because cost is
 * owner-visible data that the inventory form leaves blank for other roles.
 */
export type PartProductOption = {
  id: string;
  name: string;
  costCents: number | null;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * "Order Part" — the intake form for one sourcing record.
 *
 * Picking a catalogue product prefills the description and unit cost but leaves
 * both editable: suppliers change their prices constantly, and a field you
 * cannot correct just gets worked around with a free-form line. `productId` is
 * still recorded, which is what lets receiving move real stock later.
 */
export function PartOrderDialog({
  ticketId,
  products,
  trigger,
}: {
  ticketId: string;
  products: PartProductOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const [productId, setProductId] = React.useState("none");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [supplier, setSupplier] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [expectedAt, setExpectedAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const reset = () => {
    setProductId("none");
    setDescription("");
    setQuantity("1");
    setSupplier("");
    setCost("");
    setExpectedAt("");
    setNotes("");
  };

  // Closing happens as part of the submit rather than in an effect watching
  // `state`, so it fires exactly once per successful save.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await addPartOrderAction(ticketId, previous, formData);
      if (result.ok) {
        setOpen(false);
        reset();
        toast.success("Part added to the order list");
      }
      return result;
    },
    EMPTY_STATE,
  );

  function pickProduct(value: string) {
    setProductId(value);
    const product = products.find((p) => p.id === value);
    if (!product) return;
    setDescription(product.name);
    setCost(product.costCents != null ? dollars(product.costCents) : "");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order a part</DialogTitle>
          <DialogDescription>
            What this repair is waiting on. Receiving a catalogue part later adds
            it back to stock.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="productId" value={productId} />

          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="part-product">From inventory</Label>
            <Select value={productId} onValueChange={pickProduct}>
              <SelectTrigger id="part-product">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">Not in the catalogue…</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="part-description">Part</Label>
            <Input
              id="part-description"
              name="description"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="iPhone 13 display assembly"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="part-quantity">Qty</Label>
              <Input
                id="part-quantity"
                name="quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="part-cost">Unit cost</Label>
              <Input
                id="part-cost"
                name="costCents"
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="part-supplier">Supplier</Label>
              <Input
                id="part-supplier"
                name="supplier"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Mobile Sentrix"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="part-expected">Expected</Label>
              <Input
                id="part-expected"
                name="expectedAt"
                type="date"
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="part-notes">Notes</Label>
            <Textarea
              id="part-notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="PO number, colour, revision…"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Order part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
