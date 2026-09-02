"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Plus, TriangleAlert, Trash2 } from "lucide-react";

import {
  createPurchaseOrderAction,
  type PoFormState,
} from "@/app/(app)/inventory/purchase-orders/actions";
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
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseCents } from "@/lib/money";
import { suggestedReorderQty } from "./purchasing";

/** A catalogue product the order can be built from. */
export type PoProductOption = {
  id: string;
  name: string;
  sku: string | null;
  vendorSku: string | null;
  vendorId: string | null;
  costCents: number | null;
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
  /** True when this product is at or below its reorder point right now. */
  low: boolean;
};

export type PoVendorOption = { id: string; name: string };

const CUSTOM = "__custom__";

type Draft = {
  key: string;
  productId: string;
  description: string;
  vendorSku: string;
  quantity: string;
  unitCost: string;
};

/**
 * Raise a purchase order.
 *
 * Same shape as the billing line editor — free text while you type, parsed once
 * on serialise, posted as one hidden JSON field — so the two order-entry
 * screens in the app behave identically.
 *
 * "Add low-stock items" is the reason this screen exists rather than a plain
 * form: the buyer's actual question is "what am I about to run out of?", and
 * answering it with a button beats making them cross-reference the low-stock
 * view by hand. When a vendor is chosen the suggestion narrows to that vendor's
 * products, because that is the order being written.
 */
export function PurchaseOrderForm({
  vendors,
  products,
  initialVendorId,
}: {
  vendors: PoVendorOption[];
  products: PoProductOption[];
  initialVendorId?: string;
}) {
  const [state, formAction] = React.useActionState<PoFormState, FormData>(
    createPurchaseOrderAction,
    undefined,
  );

  const [vendorId, setVendorId] = React.useState(
    initialVendorId && vendors.some((v) => v.id === initialVendorId)
      ? initialVendorId
      : (vendors[0]?.id ?? ""),
  );
  const [drafts, setDrafts] = React.useState<Draft[]>([blank("seed-0")]);
  const [shipping, setShipping] = React.useState("0.00");
  const [expectedAt, setExpectedAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const nextKey = React.useRef(0);
  const key = () => `line-${++nextKey.current}`;

  const byId = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const update = (rowKey: string, patch: Partial<Draft>) =>
    setDrafts((rows) =>
      rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    );

  const remove = (rowKey: string) =>
    setDrafts((rows) => {
      const next = rows.filter((row) => row.key !== rowKey);
      return next.length > 0 ? next : [blank(key())];
    });

  const pickProduct = (rowKey: string, productId: string) => {
    if (productId === CUSTOM) {
      update(rowKey, { productId: CUSTOM, vendorSku: "" });
      return;
    }
    const product = byId.get(productId);
    if (!product) return;
    update(rowKey, {
      productId,
      description: product.name,
      vendorSku: product.vendorSku ?? product.sku ?? "",
      unitCost: dollars(product.costCents ?? 0),
    });
  };

  /** Products at or below their reorder point, for the vendor being ordered from. */
  const lowStock = React.useMemo(
    () =>
      products.filter(
        (product) =>
          product.low && (vendorId === "" || product.vendorId === null || product.vendorId === vendorId),
      ),
    [products, vendorId],
  );

  const fillLowStock = () => {
    const already = new Set(
      drafts.map((row) => row.productId).filter((id) => id !== CUSTOM),
    );
    const additions = lowStock
      .filter((product) => !already.has(product.id))
      .map((product) => ({
        key: key(),
        productId: product.id,
        description: product.name,
        vendorSku: product.vendorSku ?? product.sku ?? "",
        quantity: String(suggestedReorderQty(product)),
        unitCost: dollars(product.costCents ?? 0),
      }));
    if (additions.length === 0) return;
    setDrafts((rows) => [...rows.filter((row) => !isBlank(row)), ...additions]);
  };

  const payload = drafts
    .filter((row) => !isBlank(row))
    .map((row) => ({
      productId: row.productId === CUSTOM ? null : row.productId,
      description: row.description.trim(),
      quantity: qtyOf(row),
      unitCostCents: parseCents(row.unitCost),
    }));

  const subtotal = payload.reduce(
    (sum, line) => sum + line.quantity * line.unitCostCents,
    0,
  );
  const shippingCents = parseCents(shipping);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <input type="hidden" name="shippingCents" value={String(shippingCents)} />

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
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="po-vendor">
              Vendor<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="po-vendor">
                <SelectValue placeholder="Choose a vendor" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="po-expected">Expected</Label>
            <Input
              id="po-expected"
              name="expectedAt"
              type="date"
              value={expectedAt}
              onChange={(event) => setExpectedAt(event.target.value)}
            />
            <p className="text-[13px] text-muted-foreground">
              When the vendor said it would land. Optional.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Lines</CardTitle>
          <Button
            type="button"
            variant={lowStock.length > 0 ? "soft" : "outline"}
            size="sm"
            disabled={lowStock.length === 0}
            onClick={fillLowStock}
          >
            <TriangleAlert className="size-4" />
            Add low-stock items
            {lowStock.length > 0 ? (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                {lowStock.length}
              </span>
            ) : null}
          </Button>
        </CardHeader>

        <CardContent className="px-0 py-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] caption-bottom text-sm">
              <thead className="border-b border-border bg-surface-hover">
                <tr>
                  <Head className="w-[210px]">Product</Head>
                  <Head>Description</Head>
                  <Head className="w-[130px]">Vendor SKU</Head>
                  <Head className="w-[80px] text-right">Qty</Head>
                  <Head className="w-[120px] text-right">Unit cost</Head>
                  <Head className="w-[110px] text-right">Amount</Head>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {drafts.map((row) => {
                  const amount = qtyOf(row) * parseCents(row.unitCost);
                  const product = row.productId === CUSTOM ? null : byId.get(row.productId);
                  return (
                    <tr key={row.key} className="border-b border-border align-top">
                      <Cell>
                        <Select
                          value={row.productId}
                          onValueChange={(value) => pickProduct(row.key, value)}
                        >
                          <SelectTrigger aria-label="Product">
                            <SelectValue placeholder="Free text" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64 overflow-y-auto">
                            <SelectItem value={CUSTOM}>Free-text line</SelectItem>
                            {products.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.name}
                                {option.sku ? ` · ${option.sku}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {product ? (
                          <p className="mt-1.5 text-[12.5px] text-muted-foreground tabular-nums">
                            {product.stockQty} on hand
                            {product.lowStockAt != null
                              ? ` · reorder at ${product.lowStockAt}`
                              : ""}
                          </p>
                        ) : null}
                      </Cell>

                      <Cell>
                        <Input
                          value={row.description}
                          onChange={(event) =>
                            update(row.key, { description: event.target.value })
                          }
                          placeholder="What are you buying?"
                          aria-label="Description"
                        />
                      </Cell>

                      {/* Read-only: the vendor's own part number belongs to the
                          product record, and this is what gets printed on the
                          order the vendor reads. Change it on the product. */}
                      <Cell>
                        <span className="inline-flex h-10 items-center font-mono text-[13px] text-muted-foreground">
                          {row.vendorSku || "—"}
                        </span>
                      </Cell>

                      <Cell>
                        <Input
                          value={row.quantity}
                          onChange={(event) =>
                            update(row.key, { quantity: event.target.value })
                          }
                          inputMode="numeric"
                          className="text-right tabular-nums"
                          aria-label="Quantity"
                        />
                      </Cell>

                      <Cell>
                        <Input
                          value={row.unitCost}
                          onChange={(event) =>
                            update(row.key, { unitCost: event.target.value })
                          }
                          onBlur={(event) =>
                            update(row.key, {
                              unitCost: dollars(parseCents(event.target.value)),
                            })
                          }
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          aria-label="Unit cost"
                        />
                      </Cell>

                      <Cell className="text-right">
                        <span className="inline-flex h-10 items-center font-semibold tabular-nums text-foreground">
                          {formatCents(amount)}
                        </span>
                      </Cell>

                      <Cell className="pr-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-faint-foreground hover:bg-destructive-soft hover:text-destructive"
                          onClick={() => remove(row.key)}
                          aria-label="Remove line"
                        >
                          <Trash2 />
                        </Button>
                      </Cell>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="px-3 py-3">
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={() => setDrafts((rows) => [...rows, blank(key())])}
                    >
                      <Plus /> Add line
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="po-shipping">Shipping</Label>
              <Input
                id="po-shipping"
                value={shipping}
                onChange={(event) => setShipping(event.target.value)}
                onBlur={(event) => setShipping(dollars(parseCents(event.target.value)))}
                inputMode="decimal"
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="po-notes">Notes to the vendor</Label>
              <Textarea
                id="po-notes"
                name="notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ship to the store address. Call before delivery."
              />
            </div>
          </div>

          <div className="flex items-start justify-end">
            <dl className="flex w-full max-w-[300px] flex-col gap-2.5 rounded-md bg-surface-hover px-4 py-4 text-sm">
              <Row label="Subtotal" value={formatCents(subtotal)} />
              <Row label="Shipping" value={formatCents(shippingCents)} />
              <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total
                </dt>
                <dd className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                  {formatCents(subtotal + shippingCents)}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link href="/inventory/purchase-orders">Cancel</Link>
        </Button>
        <SubmitButton
          disabled={vendorId === "" || payload.length === 0}
          pendingLabel="Creating…"
        >
          Create purchase order
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function blank(key: string): Draft {
  return {
    key,
    productId: CUSTOM,
    description: "",
    vendorSku: "",
    quantity: "1",
    unitCost: "0.00",
  };
}

function isBlank(row: Draft): boolean {
  return (
    row.productId === CUSTOM &&
    row.description.trim() === "" &&
    parseCents(row.unitCost) === 0
  );
}

function qtyOf(row: Draft): number {
  const n = Number.parseInt(row.quantity, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function dollars(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

function Head({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function Cell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-top", className)} {...props} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
