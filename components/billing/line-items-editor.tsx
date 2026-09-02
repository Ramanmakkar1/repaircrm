"use client";

import * as React from "react";
import { ACTIONS } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { calcTotals, formatBps, formatCents, parseCents } from "@/lib/money";
import type { ProductOption, SubmittedLine } from "./types";

/**
 * The shared line-item editor used by every billing document — new invoice,
 * edit invoice, new estimate, edit estimate.
 *
 * It keeps quantity/price as free *text* while the user types (so "12." and a
 * half-typed "1250" behave), and only parses to integers when serialising. The
 * parsed rows are posted as one hidden JSON field (`name`), which keeps the
 * server action free of `lines[3][unitPrice]` form-key archaeology.
 *
 * Totals are computed with the very same `calcTotals` the server uses, so the
 * live footer can never disagree with what gets saved.
 */

const CUSTOM = "__custom__";
/** Radix Select cannot hold "", so "no unit chosen" needs a sentinel. */
const NO_SERIAL = "__none__";

type Draft = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
  serial: string;
};

export type InitialLine = {
  productId?: string | null;
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
  taxable?: boolean;
  serial?: string | null;
};

/** cents -> the plain "219.00" the price input shows. */
function centsToInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

function blankDraft(key: string): Draft {
  return {
    key,
    productId: CUSTOM,
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    taxable: true,
    serial: "",
  };
}

function toDraft(line: InitialLine, key: string): Draft {
  return {
    key,
    productId: line.productId ?? CUSTOM,
    description: line.description ?? "",
    quantity: String(line.quantity ?? 1),
    unitPrice: centsToInput(line.unitPriceCents ?? 0),
    taxable: line.taxable ?? true,
    serial: line.serial ?? "",
  };
}

function draftQty(draft: Draft): number {
  const n = Number.parseInt(draft.quantity, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function draftUnitCents(draft: Draft): number {
  return parseCents(draft.unitPrice);
}

/** A row the user started but left completely empty is dropped, not rejected. */
function isBlank(draft: Draft): boolean {
  return (
    draft.description.trim() === "" &&
    draftUnitCents(draft) === 0 &&
    draft.productId === CUSTOM &&
    draft.serial.trim() === ""
  );
}

export function LineItemsEditor({
  products,
  taxRateBps,
  initialLines,
  showSerial = false,
  name = "lines",
}: {
  products: ProductOption[];
  taxRateBps: number;
  initialLines?: InitialLine[];
  /** Invoices carry a per-unit serial; estimates do not. */
  showSerial?: boolean;
  name?: string;
}) {
  const seeded = React.useMemo(
    () =>
      initialLines && initialLines.length > 0
        ? initialLines.map((l, i) => toDraft(l, `seed-${i}`))
        : [blankDraft("seed-0")],
    [initialLines],
  );

  const [drafts, setDrafts] = React.useState<Draft[]>(seeded);
  const nextKey = React.useRef(0);

  const update = React.useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }, []);

  const remove = React.useCallback((key: string) => {
    setDrafts((rows) => {
      const next = rows.filter((row) => row.key !== key);
      return next.length > 0 ? next : [blankDraft("empty-0")];
    });
  }, []);

  const addRow = React.useCallback(() => {
    nextKey.current += 1;
    setDrafts((rows) => [...rows, blankDraft(`new-${nextKey.current}`)]);
  }, []);

  /** Picking a product fills the row; picking "Custom" leaves it untouched. */
  const pickProduct = React.useCallback(
    (key: string, productId: string) => {
      if (productId === CUSTOM) {
        update(key, { productId: CUSTOM });
        return;
      }
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      update(key, {
        productId,
        description: product.name,
        unitPrice: centsToInput(product.priceCents),
        taxable: product.taxable,
        // One row per physical unit, so a serialized product starts at one and
        // drops whatever serial the previous product had chosen.
        ...(product.serialized ? { quantity: "1", serial: "" } : { serial: "" }),
      });
    },
    [products, update],
  );

  const payload: SubmittedLine[] = React.useMemo(
    () =>
      drafts.filter((d) => !isBlank(d)).map((d) => ({
        productId: d.productId === CUSTOM ? null : d.productId,
        description: d.description.trim(),
        quantity: draftQty(d),
        unitPriceCents: draftUnitCents(d),
        taxable: d.taxable,
        serial: showSerial && d.serial.trim() !== "" ? d.serial.trim() : null,
      })),
    [drafts, showSerial],
  );

  const totals = React.useMemo(
    () => calcTotals(payload, taxRateBps),
    [payload, taxRateBps],
  );

  /**
   * The serials a row may choose from, or null when the row is not a
   * serialized product (and therefore keeps the free-text box).
   */
  const serialsFor = React.useCallback(
    (draft: Draft): string[] | null => {
      if (draft.productId === CUSTOM) return null;
      const product = products.find((p) => p.id === draft.productId);
      if (!product?.serialized) return null;
      const available = product.serials ?? [];
      const current = draft.serial.trim();
      return current && !available.includes(current)
        ? [current, ...available]
        : available;
    },
    [products],
  );

  const colCount = showSerial ? 7 : 6;

  return (
    <div className="flex flex-col">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[780px] caption-bottom text-sm">
          <thead className="border-b border-border">
            <tr>
              <Head className="w-[190px]">Product</Head>
              <Head>Description</Head>
              <Head className="w-[80px] text-right">Qty</Head>
              <Head className="w-[120px] text-right">Unit price</Head>
              <Head className="w-[70px] text-center">Tax</Head>
              {showSerial ? <Head className="w-[150px]">Serial</Head> : null}
              <Head className="w-[110px] text-right">Amount</Head>
              <th className="w-12" />
            </tr>
          </thead>

          <tbody>
            {drafts.map((draft) => {
              const amount = draftQty(draft) * draftUnitCents(draft);
              return (
                <tr key={draft.key} className="border-b border-border align-top">
                  <Cell>
                    <Select
                      value={draft.productId}
                      onValueChange={(v) => pickProduct(draft.key, v)}
                    >
                      <SelectTrigger aria-label="Product">
                        <SelectValue placeholder="Custom" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64 overflow-y-auto">
                        <SelectItem value={CUSTOM}>Custom line</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.sku ? ` · ${p.sku}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Cell>

                  <Cell>
                    <Input
                      value={draft.description}
                      onChange={(e) =>
                        update(draft.key, { description: e.target.value })
                      }
                      placeholder="What are you billing for?"
                      aria-label="Description"
                    />
                  </Cell>

                  <Cell>
                    <Input
                      value={draft.quantity}
                      onChange={(e) =>
                        update(draft.key, { quantity: e.target.value })
                      }
                      inputMode="numeric"
                      className="text-right tabular-nums"
                      aria-label="Quantity"
                    />
                  </Cell>

                  <Cell>
                    <Input
                      value={draft.unitPrice}
                      onChange={(e) =>
                        update(draft.key, { unitPrice: e.target.value })
                      }
                      onBlur={(e) =>
                        update(draft.key, {
                          unitPrice: centsToInput(parseCents(e.target.value)),
                        })
                      }
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      aria-label="Unit price"
                    />
                  </Cell>

                  <Cell className="text-center">
                    <div className="flex h-10 items-center justify-center">
                      <Checkbox
                        checked={draft.taxable}
                        onCheckedChange={(v) =>
                          update(draft.key, { taxable: v === true })
                        }
                        aria-label="Taxable"
                      />
                    </div>
                  </Cell>

                  {showSerial ? (
                    <Cell>
                      {/* A serialized product sells specific units, so the
                          serial is a choice from what's in stock rather than
                          free text — the same rule the register enforces. The
                          line's existing serial stays selectable when editing,
                          because that unit is already committed to this
                          invoice and is no longer "in stock". */}
                      {serialsFor(draft) ? (
                        <Select
                          value={draft.serial || NO_SERIAL}
                          onValueChange={(v) =>
                            update(draft.key, { serial: v === NO_SERIAL ? "" : v })
                          }
                        >
                          <SelectTrigger aria-label="Serial number">
                            <SelectValue placeholder="Pick a unit" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64 overflow-y-auto">
                            <SelectItem value={NO_SERIAL}>No unit yet</SelectItem>
                            {serialsFor(draft)?.map((serial) => (
                              <SelectItem key={serial} value={serial}>
                                {serial}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={draft.serial}
                          onChange={(e) =>
                            update(draft.key, { serial: e.target.value })
                          }
                          placeholder="—"
                          aria-label="Serial number"
                        />
                      )}
                    </Cell>
                  ) : null}

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
                      onClick={() => remove(draft.key)}
                      aria-label="Remove line"
                    >
                      <ACTIONS.delete />
                    </Button>
                  </Cell>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={colCount - 1} className="px-3 py-3">
                <Button type="button" variant="soft" size="sm" onClick={addRow}>
                  <ACTIONS.add /> Add line
                </Button>
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 flex justify-end rounded-md bg-surface-hover px-4 py-4">
        <dl className="flex w-full max-w-[300px] flex-col gap-2.5 text-sm">
          <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
          <TotalRow
            label={`Tax (${formatBps(taxRateBps)})`}
            value={formatCents(totals.taxCents)}
          />
          <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </dt>
            <dd className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
              {formatCents(totals.totalCents)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Head({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
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

function Cell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
