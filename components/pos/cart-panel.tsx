"use client";

import * as React from "react";
import { Banknote, CreditCard, Minus, Plus, ScrollText, Trash2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBps, formatCents, type Totals } from "@/lib/money";
import { CustomItemDialog } from "./custom-item-dialog";
import { METHOD_LABELS, type CartLine, type PosCustomer, type TenderMethod } from "./types";

/** The sentinel Radix uses for "no customer" — Select cannot hold an empty value. */
export const WALK_IN_VALUE = "__walk_in__";

const TENDER_BUTTONS: { method: TenderMethod; icon: React.ComponentType<{ className?: string }> }[] = [
  { method: "CASH", icon: Banknote },
  { method: "CARD", icon: CreditCard },
  { method: "CHECK", icon: ScrollText },
  { method: "OTHER", icon: Wallet },
];

/**
 * The cart: what is being bought, who is buying it, and how they are paying.
 *
 * It stays a single column at every width and sticks to the top of the viewport
 * on desktop, so the running total never scrolls out from under the cashier
 * while they page through the product grid.
 */
export function CartPanel({
  lines,
  totals,
  taxRateBps,
  customers,
  customerId,
  onCustomerChange,
  onQuantityChange,
  onRemove,
  onClear,
  onAddCustom,
  onTender,
  disabled,
}: {
  lines: CartLine[];
  totals: Totals;
  taxRateBps: number;
  customers: PosCustomer[];
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onAddCustom: (item: { name: string; unitPriceCents: number; taxable: boolean }) => void;
  onTender: (method: TenderMethod) => void;
  disabled: boolean;
}) {
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const credit = customer?.creditBalanceCents ?? 0;
  const empty = lines.length === 0;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  // Store credit is only ever offered when there is credit to spend — an
  // enabled button that always errors is worse than no button at all.
  const creditReady = credit > 0;

  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Cart
          {itemCount > 0 ? (
            <span className="ml-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums text-accent-soft-foreground">
              {itemCount}
            </span>
          ) : null}
        </h2>
        {!empty ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ lines */}
      <div className="max-h-[38vh] min-h-[7rem] overflow-y-auto lg:max-h-[42vh]">
        {empty ? (
          <p className="px-5 py-10 text-center text-[14px] leading-snug text-muted-foreground">
            Scan an item or tap a tile
            <br />
            to start a sale.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <CartRow
                key={line.key}
                line={line}
                disabled={disabled}
                onQuantityChange={onQuantityChange}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </div>

      {/* --------------------------------------------- customer + custom item */}
      <div className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
        <CustomItemDialog onAdd={onAddCustom} />

        <Select
          value={customerId ?? WALK_IN_VALUE}
          onValueChange={(value) =>
            onCustomerChange(value === WALK_IN_VALUE ? null : value)
          }
        >
          <SelectTrigger className="h-12" aria-label="Attach a customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={WALK_IN_VALUE}>Walk-in</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
                {c.creditBalanceCents > 0
                  ? ` · ${formatCents(c.creditBalanceCents)} credit`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ----------------------------------------------------------- totals */}
      <div className="flex flex-col gap-2 border-t border-border bg-surface-hover px-5 py-4">
        <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
        <Row
          label={`Sales tax (${formatBps(taxRateBps)})`}
          value={formatCents(totals.taxCents)}
        />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="text-[15px] font-bold text-foreground">Total</span>
          <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatCents(totals.totalCents)}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------- tenders */}
      <div className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          {TENDER_BUTTONS.map(({ method, icon: Icon }) => (
            <Button
              key={method}
              variant={method === "CASH" ? "default" : "soft"}
              onClick={() => onTender(method)}
              disabled={empty || disabled}
              className="h-14 text-[15px]"
            >
              <Icon />
              {METHOD_LABELS[method]}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          onClick={() => onTender("CREDIT")}
          disabled={empty || disabled || !creditReady}
          className="h-14 text-[15px]"
          title={
            creditReady
              ? undefined
              : "Attach a customer who has store credit to use this."
          }
        >
          <Wallet />
          {creditReady
            ? `Store credit · ${formatCents(credit)} available`
            : "Store credit"}
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[14px] text-muted-foreground">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * One cart row. The steppers are deliberately big squares rather than a number
 * input — at a counter, "one more of those" is a thumb, not a keyboard.
 */
function CartRow({
  line,
  disabled,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine;
  disabled: boolean;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
}) {
  const lineTotal = line.quantity * line.unitPriceCents;
  const oversold =
    line.stockQty !== null && line.quantity > Math.max(line.stockQty, 0);

  return (
    <li className="flex flex-col gap-2 px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-foreground">
          {line.name}
        </span>
        <button
          type="button"
          onClick={() => onRemove(line.key)}
          disabled={disabled}
          aria-label={`Remove ${line.name}`}
          className="-mr-1 shrink-0 rounded-sm p-1 text-faint-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Stepper
            label={`Fewer ${line.name}`}
            icon={Minus}
            disabled={disabled}
            onClick={() => onQuantityChange(line.key, line.quantity - 1)}
          />
          <span className="w-9 text-center text-[15px] font-bold tabular-nums text-foreground">
            {line.quantity}
          </span>
          <Stepper
            label={`More ${line.name}`}
            icon={Plus}
            disabled={disabled}
            onClick={() => onQuantityChange(line.key, line.quantity + 1)}
          />
          <span className="ml-1.5 text-[12.5px] tabular-nums text-faint-foreground">
            × {formatCents(line.unitPriceCents)}
          </span>
        </div>

        <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
          {formatCents(lineTotal)}
        </span>
      </div>

      {oversold ? (
        <span className="text-[12px] font-semibold text-status-overdue-fg">
          Only {Math.max(line.stockQty ?? 0, 0)} in stock — selling anyway.
        </span>
      ) : null}
    </li>
  );
}

function Stepper({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground transition-colors",
        "hover:border-accent/40 hover:bg-surface-hover active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
