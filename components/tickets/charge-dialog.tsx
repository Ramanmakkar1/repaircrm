"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  addChargeAction,
  updateChargeAction,
} from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";

export type ProductOption = {
  id: string;
  name: string;
  priceCents: number;
  taxable: boolean;
};

export type ChargeDraft = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * Add or edit one labour/parts line.
 *
 * Picking a product prefills description, price and taxability but doesn't lock
 * them — shops discount and substitute constantly, and a line you can't adjust
 * just gets replaced by a free-form one anyway. `productId` is still recorded,
 * so the line stays traceable back to inventory.
 */
export function ChargeDialog({
  ticketId,
  products,
  charge,
  trigger,
}: {
  ticketId: string;
  products: ProductOption[];
  charge?: ChargeDraft;
  trigger: React.ReactNode;
}) {
  const isEdit = charge !== undefined;
  const [open, setOpen] = React.useState(false);

  const [productId, setProductId] = React.useState("none");
  const [description, setDescription] = React.useState(charge?.description ?? "");
  const [quantity, setQuantity] = React.useState(String(charge?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = React.useState(
    charge ? dollars(charge.unitPriceCents) : "",
  );
  const [taxable, setTaxable] = React.useState(charge?.taxable ?? true);

  // Closing/resetting happens as part of the submit rather than in an effect
  // watching `state`, so it fires exactly once per successful save.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = isEdit
        ? await updateChargeAction(charge.id, previous, formData)
        : await addChargeAction(ticketId, previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success(isEdit ? "Charge updated" : "Charge added");
        if (!isEdit) {
          setProductId("none");
          setDescription("");
          setQuantity("1");
          setUnitPrice("");
          setTaxable(true);
        }
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
    setUnitPrice(dollars(product.priceCents));
    setTaxable(product.taxable);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit charge" : "Add charge"}</DialogTitle>
          <DialogDescription>
            Parts and labour accrued on this ticket, ready to pull onto an invoice.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="taxable" value={taxable ? "on" : ""} />
          {!isEdit ? (
            <input type="hidden" name="productId" value={productId} />
          ) : null}

          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}

          {!isEdit ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="charge-product">From inventory</Label>
              <Select value={productId} onValueChange={pickProduct}>
                <SelectTrigger id="charge-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none">Custom line…</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="charge-description">Description</Label>
            <Input
              id="charge-description"
              name="description"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Display assembly replacement"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="charge-quantity">Qty</Label>
              <Input
                id="charge-quantity"
                name="quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="charge-price">Unit price</Label>
              <Input
                id="charge-price"
                name="unitPrice"
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox
              checked={taxable}
              onCheckedChange={(value) => setTaxable(value === true)}
            />
            <span className="text-sm text-foreground">Taxable</span>
          </label>

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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add charge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
