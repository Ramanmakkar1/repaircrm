"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { AlertCircle, Info, TriangleAlert } from "lucide-react";

import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "@/app/(app)/inventory/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { marginPct } from "./format";

export type ProductFormValues = {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  upc: string | null;
  description: string | null;
  priceCents: number;
  costCents: number | null;
  taxable: boolean;
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
  vendorId: string | null;
  vendorSku: string | null;
  serialized: boolean;
  active: boolean;
};

/** A supplier the product can be sourced from. */
export type VendorOption = { id: string; name: string };

/** Radix Select cannot hold "", so "no vendor" needs a sentinel. */
const NO_VENDOR = "__none__";

type TextKey =
  | "name"
  | "category"
  | "sku"
  | "upc"
  | "description"
  | "price"
  | "cost"
  | "stockQty"
  | "lowStockAt"
  | "reorderQty"
  | "vendorSku";

type Values = Record<TextKey, string> & {
  taxable: boolean;
  active: boolean;
  serialized: boolean;
  vendorId: string;
};

const dollars = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);

function initialValues(product?: ProductFormValues | null): Values {
  return {
    name: product?.name ?? "",
    category: product?.category ?? "",
    sku: product?.sku ?? "",
    upc: product?.upc ?? "",
    description: product?.description ?? "",
    price: product ? dollars(product.priceCents) : "",
    cost: dollars(product?.costCents),
    stockQty: product ? String(product.stockQty) : "",
    lowStockAt: product?.lowStockAt == null ? "" : String(product.lowStockAt),
    reorderQty: product?.reorderQty == null ? "" : String(product.reorderQty),
    vendorSku: product?.vendorSku ?? "",
    vendorId: product?.vendorId ?? NO_VENDOR,
    taxable: product?.taxable ?? true,
    serialized: product?.serialized ?? false,
    active: product?.active ?? true,
  };
}

/**
 * One form, two routes: /inventory/new posts to createProductAction and
 * /inventory/[id]/edit posts to updateProductAction. Both redirect on success,
 * so the only state this ever renders is the validation failure path.
 *
 * Every field is CONTROLLED on purpose. React 19 resets a `<form action={…}>`
 * once the action settles, which would wipe the form the moment the server
 * came back with "that SKU is taken". Controlled values survive that reset.
 *
 * Stock quantity only exists on the CREATE form. Once a product is real, its
 * level moves through the Adjust Stock dialog so every change lands in the
 * audit trail — a silently editable number here would be a hole in it.
 */
export function ProductForm({
  product,
  vendors,
  canSeeCost,
}: {
  product?: ProductFormValues | null;
  /** Suppliers this product can be bought from. */
  vendors: VendorOption[];
  /** Cost is owner-only; a non-owner never sees or submits it. */
  canSeeCost: boolean;
}) {
  const isEdit = Boolean(product);
  const [state, formAction] = React.useActionState<ProductFormState, FormData>(
    isEdit ? updateProductAction : createProductAction,
    undefined,
  );
  const [values, setValues] = React.useState<Values>(() => initialValues(product));
  const [confirmed, setConfirmed] = React.useState(false);

  // Turning serial tracking ON for a product that already has stock is the one
  // destructive edit on this form, so it asks first (and the server refuses
  // without the confirmation).
  const needsSerialConfirm =
    isEdit && values.serialized && !product?.serialized && (product?.stockQty ?? 0) !== 0;

  const set = React.useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const errors = state?.fieldErrors ?? {};
  const cancelHref = product ? `/inventory/${product.id}` : "/inventory";

  const field = (key: TextKey) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value),
  });

  // Live margin readout — the number an owner is actually pricing against.
  const margin = React.useMemo(() => {
    const price = Math.round(Number.parseFloat(values.price) * 100);
    const cost = Math.round(Number.parseFloat(values.cost) * 100);
    if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
    return marginPct(price, cost);
  }, [values.price, values.cost]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {state?.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              {...field("name")}
              autoFocus={!isEdit}
              placeholder="iPhone 14 Screen Assembly"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <Field
            label="Category"
            htmlFor="category"
            error={errors.category}
            hint="Free text — reuse an existing one to keep the filter tidy."
          >
            <Input {...field("category")} placeholder="Parts / Displays" />
          </Field>

          <Field
            label="SKU"
            htmlFor="sku"
            error={errors.sku}
            hint="Your own part number. Printed as the label barcode."
          >
            <Input
              {...field("sku")}
              className="font-mono uppercase"
              placeholder="SCR-IP14"
              aria-invalid={Boolean(errors.sku)}
            />
          </Field>

          <Field
            label="UPC"
            htmlFor="upc"
            error={errors.upc}
            hint="The manufacturer's barcode, if the part carries one."
          >
            <Input
              {...field("upc")}
              className="font-mono"
              inputMode="numeric"
              placeholder="0810001100011"
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              {...field("description")}
              rows={3}
              placeholder="OEM-pull OLED display with frame, tested."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Price" htmlFor="price" required error={errors.price}>
            <MoneyInput {...field("price")} aria-invalid={Boolean(errors.price)} />
          </Field>

          {canSeeCost ? (
            <Field
              label="Cost"
              htmlFor="cost"
              error={errors.cost}
              hint={
                margin == null
                  ? "What you pay your supplier. Owners only."
                  : `${margin}% gross margin at this price.`
              }
            >
              <MoneyInput {...field("cost")} aria-invalid={Boolean(errors.cost)} />
            </Field>
          ) : null}

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-hover/60 p-4 sm:col-span-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="taxable">Taxable</Label>
              <p className="text-[13px] text-muted-foreground">
                Apply the shop&rsquo;s sales tax when this is sold. Turn off for
                labour in tax-exempt jurisdictions.
              </p>
            </div>
            <Switch
              id="taxable"
              name="taxable"
              checked={values.taxable}
              onCheckedChange={(next) => set("taxable", next)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchasing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {/* Radix Select isn't a form control, so the chosen id rides along in
              a hidden input. "None" posts blank and clears the link. */}
          <input
            type="hidden"
            name="vendorId"
            value={values.vendorId === NO_VENDOR ? "" : values.vendorId}
          />
          <Field
            label="Vendor"
            htmlFor="vendorId"
            error={errors.vendorId}
            hint={
              vendors.length === 0
                ? "No vendors yet — add one under Inventory ▸ Vendors."
                : "Who you buy this from. Purchase orders start from here."
            }
          >
            <Select
              value={values.vendorId}
              onValueChange={(next) => set("vendorId", next)}
            >
              <SelectTrigger id="vendorId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={NO_VENDOR}>No vendor</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Vendor SKU"
            htmlFor="vendorSku"
            error={errors.vendorSku}
            hint="Their part number — printed on the purchase order they read."
          >
            <Input
              {...field("vendorSku")}
              className="font-mono"
              placeholder="MS-IP14-OLED"
            />
          </Field>

          <Field
            label="Reorder quantity"
            htmlFor="reorderQty"
            error={errors.reorderQty}
            hint="How many to buy when this runs low. Blank orders back up to twice the reorder point."
            className="sm:col-span-2"
          >
            <Input
              {...field("reorderQty")}
              type="number"
              step={1}
              min={1}
              inputMode="numeric"
              placeholder="Auto"
              className="tabular-nums"
              aria-invalid={Boolean(errors.reorderQty)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {isEdit ? (
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-hover/60 px-4 py-3 text-[13px] text-muted-foreground sm:col-span-2">
              <Info className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
              <span>
                Stock on hand is currently{" "}
                <strong className="font-semibold text-foreground tabular-nums">
                  {product?.stockQty ?? 0}
                </strong>
                . Change it from the product page so the adjustment is recorded
                with a reason.
              </span>
            </div>
          ) : values.serialized ? (
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-hover/60 px-4 py-3 text-[13px] text-muted-foreground sm:col-span-2">
              <Info className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
              <span>
                A serialized product starts empty — add the units by serial
                number from the product page once it exists.
              </span>
            </div>
          ) : (
            <Field
              label="Stock on hand"
              htmlFor="stockQty"
              error={errors.stockQty}
              hint="Recorded as an “Initial stock” adjustment. Leave at 0 for labour and services."
            >
              <Input
                {...field("stockQty")}
                type="number"
                step={1}
                inputMode="numeric"
                placeholder="0"
                className="tabular-nums"
                aria-invalid={Boolean(errors.stockQty)}
              />
            </Field>
          )}

          <Field
            label="Reorder point"
            htmlFor="lowStockAt"
            error={errors.lowStockAt}
            hint="Warn when stock reaches this level. Leave blank for items you don't stock."
            className={isEdit || values.serialized ? "sm:col-span-2" : undefined}
          >
            <Input
              {...field("lowStockAt")}
              type="number"
              step={1}
              min={0}
              inputMode="numeric"
              placeholder="None"
              className="tabular-nums"
              aria-invalid={Boolean(errors.lowStockAt)}
            />
          </Field>

          <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-hover/60 p-4 sm:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="serialized">Track serial numbers</Label>
                <p className="text-[13px] text-muted-foreground">
                  Every unit gets its own record, so you can tell which handset
                  went to which customer. On-hand becomes the count of units in
                  stock rather than a number you type.
                </p>
              </div>
              <Switch
                id="serialized"
                name="serialized"
                checked={values.serialized}
                onCheckedChange={(next) => set("serialized", next)}
              />
            </div>

            {needsSerialConfirm ? (
              <label className="flex items-start gap-2.5 rounded-md border border-status-in-progress/30 bg-status-in-progress-bg px-3.5 py-3 text-[13px] text-status-in-progress-fg">
                <input
                  type="checkbox"
                  name="serializedConfirm"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-current"
                />
                <span className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong className="font-bold">
                      This resets on-hand from {product?.stockQty ?? 0} to 0.
                    </strong>{" "}
                    There are no serial numbers for the units already on the
                    shelf, so they have to be entered by serial afterwards. The
                    reset is recorded as an adjustment.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-hover/60 p-4 sm:col-span-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="active">Active</Label>
              <p className="text-[13px] text-muted-foreground">
                Inactive products stay on old invoices but stop showing up when
                staff search for something to sell.
              </p>
            </div>
            <Switch
              id="active"
              name="active"
              checked={values.active}
              onCheckedChange={(next) => set("active", next)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton disabled={needsSerialConfirm && !confirmed}>
          {isEdit ? "Save changes" : "Create product"}
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** A money box with the currency symbol built into the field, not the label. */
function MoneyInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-faint-foreground">
        $
      </span>
      <Input
        {...props}
        inputMode="decimal"
        placeholder="0.00"
        className={cn("pl-7 tabular-nums", className)}
      />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving…" : children}
    </Button>
  );
}
