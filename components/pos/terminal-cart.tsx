"use client";

import * as React from "react";
import { ChevronUp, Lock, Minus, Plus, ScrollText, ShoppingBag, Trash2 } from "lucide-react";

import { ProductImage } from "@/components/inventory/product-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICONS } from "@/components/ui/icons";
import { formatBps, formatCents, type Totals } from "@/lib/money";
import { CustomerPicker } from "./customer-picker";
import { CustomItemDialog } from "./custom-item-dialog";
import { cartItemCount, cartScrollTarget, moreTenders, repairLineLabel } from "./terminal-logic";
import { TicketPickerDialog } from "./ticket-picker-dialog";
import {
  isSerialLine,
  isTicketLine,
  type CartLine,
  type PosCustomer,
  type PosProduct,
  type PosTicket,
  type TenderMethod,
} from "./types";

const MORE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CHECK: ScrollText,
  OTHER: ICONS.deposit,
  CREDIT: ICONS.credit,
};

/**
 * The cart of the one-screen register.
 *
 * From `lg` it is exactly as tall as the screen area it is given: the header
 * (who is buying, Clear), the quick-add row, the totals and the Pay buttons stay
 * put, and only the lines in the middle scroll. Pay is therefore always visible.
 * Below `lg` it is an ordinary card in the page, under the products, with the
 * same parts in the same order.
 *
 * Same props and same callbacks as `CartPanel`, so the register can swap one
 * for the other without touching a cart rule.
 */
export function TerminalCart({
  lines,
  products = [],
  totals,
  taxRateBps,
  depositCents,
  dueCents,
  customers,
  customerId,
  onCustomerChange,
  onQuantityChange,
  onRemove,
  onClear,
  onAddCustom,
  onTender,
  disabled,
  tickets,
  attachedTicketId,
  onPickTicket,
  onRemoveTicket,
  tendersRef,
}: {
  lines: CartLine[];
  products?: PosProduct[];
  totals: Totals;
  taxRateBps: number;
  /** Deposit already on account against the attached repair, in cents. */
  depositCents: number;
  /** Total minus that deposit: what the customer actually hands over. */
  dueCents: number;
  customers: PosCustomer[];
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onAddCustom: (item: { name: string; unitPriceCents: number; taxable: boolean }) => void;
  onTender: (method: TenderMethod) => void;
  disabled: boolean;
  tickets: PosTicket[];
  attachedTicketId: string | null;
  onPickTicket: (ticket: PosTicket) => void;
  onRemoveTicket: () => void;
  /** Watched by the sticky pay bar on small screens, which steps aside while this is on screen. */
  tendersRef?: React.Ref<HTMLDivElement>;
}) {
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const credit = customer?.creditBalanceCents ?? 0;
  const empty = lines.length === 0;
  const itemCount = cartItemCount(lines);

  // A repair's lines are one locked block above the loose items, so the cashier
  // sees "this repair" as a single thing rather than rows they might edit.
  const ticketLines = lines.filter(isTicketLine);
  const looseLines = lines.filter((line) => !isTicketLine(line));
  const ticketNumber = ticketLines[0]?.ticketNumber ?? null;
  const ticketTotalCents = ticketLines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceCents,
    0,
  );
  // Attaching a repair fixes who is buying: the invoice links back to it.
  const customerLocked = attachedTicketId !== null;

  // Keep what was just added in view: a loose item lands at the bottom of the
  // list, but a repair is the block at the TOP, so picking one scrolls up to its
  // "Repair #N / Remove" header instead of past it.
  const linesRef = React.useRef<HTMLDivElement>(null);
  const before = React.useRef({ ticket: ticketLines.length, loose: looseLines.length });
  React.useEffect(() => {
    const after = { ticket: ticketLines.length, loose: looseLines.length };
    const list = linesRef.current;
    const target = cartScrollTarget(before.current, after);
    if (list && target) list.scrollTop = target === "top" ? 0 : list.scrollHeight;
    before.current = after;
  }, [ticketLines.length, looseLines.length]);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl shadow-none">
      {/* ----------------------------------------- header: title, who, clear */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
            Current sale
            {itemCount > 0 ? (
              <span className="rf-num rounded-md bg-accent-soft px-2 py-0.5 text-[13px] font-semibold text-accent-soft-foreground">
                {itemCount}
              </span>
            ) : null}
          </h2>
          {!empty ? (
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              // Its 48px target overlaps the row's spare space instead of
              // stretching the row, so the header stays slim.
              className="-mr-2 -my-2 min-h-12 rounded-md px-3 text-[14px] font-semibold text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
        <CustomerPicker
          compact
          customers={customers}
          customerId={customerId}
          onCustomerChange={onCustomerChange}
          disabled={customerLocked}
          ticketNumber={ticketNumber}
        />
      </div>

      {/* ------------------------------------------------------------ lines */}
      <div ref={linesRef} className="max-h-[38vh] min-h-[5.5rem] flex-1 overflow-y-auto lg:max-h-none lg:min-h-0">
        {empty ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
            <ShoppingBag className="size-9 text-faint-foreground" strokeWidth={1.5} aria-hidden />
            <p className="text-[16px] font-semibold text-foreground">Nothing here yet</p>
            <p className="text-[14px] leading-snug text-muted-foreground">
              Tap a picture or scan a barcode.
            </p>
          </div>
        ) : (
          <>
            {ticketLines.length > 0 ? (
              <section className="border-b border-border bg-accent-soft/25">
                {/* Stays at the top of the lines while the repair's rows scroll under
                    it, so Remove is always in reach. The solid layer keeps the rows
                    from showing through the tint. */}
                <div className="sticky top-0 z-10 border-b border-border bg-surface">
                  <div className="flex items-center justify-between gap-3 bg-accent-soft/25 pl-4 pr-2">
                    <span className="flex items-center gap-1.5 text-[14px] font-bold text-accent-soft-foreground">
                      <ICONS.ticket className="size-4" aria-hidden />
                      Repair #{ticketNumber}
                      <Lock className="size-3 opacity-60" aria-hidden />
                    </span>
                    <button
                      type="button"
                      onClick={onRemoveTicket}
                      disabled={disabled}
                      className="min-h-12 rounded-md px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <ul className="divide-y divide-border">
                  {ticketLines.map((line) => (
                    <li key={line.key} className="flex items-start justify-between gap-3 px-4 py-2.5 lg:py-2">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[14px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
                          {repairLineLabel(line)}
                        </span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          {line.quantity} × {formatCents(line.unitPriceCents)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                        {formatCents(line.quantity * line.unitPriceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-2 lg:py-1.5">
                  <span className="text-[13px] font-semibold text-muted-foreground">Repair subtotal</span>
                  <span className="text-[14px] font-bold tabular-nums text-foreground">
                    {formatCents(ticketTotalCents)}
                  </span>
                </div>
              </section>
            ) : null}

            <ul className="divide-y divide-border">
              {looseLines.map((line) => (
                <TerminalLine
                  key={line.key}
                  line={line}
                  product={products.find((product) => product.id === line.productId)}
                  disabled={disabled}
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {/* --------------------------------------------------------- quick add */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-4 py-1">
        <CustomItemDialog compact onAdd={onAddCustom} />
        <TicketPickerDialog
          compact
          tickets={tickets}
          attachedTicketId={attachedTicketId}
          onPick={onPickTicket}
          disabled={disabled}
        />
      </div>

      {/* ----------------------------------------------------------- totals */}
      {/* From lg the right edge is pulled in so no amount sits under the round
          assistant button the shell floats at the bottom-right of this screen. */}
      <div className="flex shrink-0 flex-col border-t border-border bg-surface-hover/40 px-4 py-2 lg:pr-14 xl:pr-8">
        <TotalsRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
        <TotalsRow
          label={`Sales tax (${formatBps(taxRateBps)})`}
          value={formatCents(totals.taxCents)}
        />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-1">
          <span className="text-[15px] font-bold text-foreground">Total</span>
          <span
            className={cn(
              "font-bold tabular-nums tracking-tight text-foreground",
              depositCents > 0 ? "text-lg leading-6" : "text-[28px] leading-9",
            )}
          >
            {formatCents(totals.totalCents)}
          </span>
        </div>
        {depositCents > 0 ? (
          // The deposit and what is left to pay share one row (label over amount),
          // which keeps the totals short so more of the lines stay in view.
          <div className="mt-1 flex items-end justify-between gap-4 border-t border-border pt-1">
            <div className="flex min-w-0 flex-col">
              <span className="text-[14px] leading-5 text-muted-foreground">Deposit on file</span>
              <span className="text-[15px] font-semibold leading-6 tabular-nums text-foreground">
                {`−${formatCents(depositCents)}`}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-end">
              <span className="text-[15px] font-bold leading-5 text-foreground">Due now</span>
              <span className="text-[28px] font-bold leading-8 tabular-nums tracking-tight text-foreground">
                {formatCents(dueCents)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------------- pay */}
      <div
        ref={tendersRef}
        className="grid shrink-0 scroll-mb-32 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-2 border-t border-border bg-surface p-2.5"
      >
        <Button
          onClick={() => onTender("CASH")}
          disabled={empty || disabled}
          className="h-14 text-base"
        >
          <ICONS.cash />
          Cash
        </Button>
        <Button
          variant="soft"
          onClick={() => onTender("CARD")}
          disabled={empty || disabled}
          className="h-14 text-base"
        >
          <ICONS.payment />
          Card
        </Button>
        <MoreTenders creditCents={credit} disabled={empty || disabled} onTender={onTender} />
      </div>
    </Card>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 leading-6 lg:leading-5">
      <span className="text-[14px] text-muted-foreground">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * "More": Check, Other and Store credit, in a menu that opens upward from the
 * Pay row. Store credit is listed but switched off (and says why) until a
 * customer with credit is on the sale.
 */
function MoreTenders({
  creditCents,
  disabled,
  onTender,
}: {
  creditCents: number;
  disabled: boolean;
  onTender: (method: TenderMethod) => void;
}) {
  return (
    // Not modal: the tender dialog it opens would fight a modal menu over the
    // page's pointer events.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label="More ways to pay"
          className="h-14 gap-1 px-4 text-base"
        >
          More
          <ChevronUp className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-[min(18rem,calc(100vw-2rem))] p-2">
        {moreTenders(creditCents).map((option) => {
          const Icon = MORE_ICONS[option.method] ?? ICONS.payment;
          return (
            <DropdownMenuItem
              key={option.method}
              disabled={option.disabled}
              onSelect={() => onTender(option.method)}
              className="min-h-12 px-3 text-[15px]"
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                {option.hint ? (
                  <span className="whitespace-normal text-[12px] font-normal leading-snug text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One loose line: picture, name, the line total, and under them the quantity
 * steppers, the price each and the bin. The steppers are big squares rather
 * than a number field: at a counter "one more of those" is a thumb, not a
 * keyboard. Stepping to zero removes the line.
 */
function TerminalLine({
  line,
  product,
  disabled,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine;
  product?: PosProduct;
  disabled: boolean;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
}) {
  const lineTotal = line.quantity * line.unitPriceCents;
  const oversold = line.stockQty !== null && line.quantity > Math.max(line.stockQty, 0);
  // A serialized line is one specific unit, so there is nothing to step.
  const serialised = isSerialLine(line);

  return (
    <li className="flex gap-3 px-4 py-2.5">
      {product ? (
        <ProductImage
          productId={product.id}
          name={product.name}
          category={product.category}
          catalogImage={product.catalogImage}
          imageUrl={product.imageUrl}
          className="size-12 shrink-0 rounded-md"
          sizes="48px"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-3">
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {line.name}
          </span>
          <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
            {formatCents(lineTotal)}
          </span>
        </div>

        {serialised ? (
          <span className="flex items-center gap-1.5 font-mono text-[12.5px] font-semibold text-accent-soft-foreground">
            <ICONS.serial className="size-3.5" aria-hidden />
            {line.serial}
          </span>
        ) : null}

        <div className="flex items-center gap-1">
          {serialised ? (
            <span className="flex-1 text-[13px] tabular-nums text-muted-foreground">
              1 × {formatCents(line.unitPriceCents)}
            </span>
          ) : (
            <>
              <Stepper
                label={`Fewer ${line.name}`}
                icon={Minus}
                disabled={disabled}
                onClick={() => onQuantityChange(line.key, line.quantity - 1)}
              />
              <span className="w-8 text-center text-[16px] font-bold tabular-nums text-foreground">
                {line.quantity}
              </span>
              <Stepper
                label={`More ${line.name}`}
                icon={Plus}
                disabled={disabled}
                onClick={() => onQuantityChange(line.key, line.quantity + 1)}
              />
              <span className="ml-1.5 min-w-0 flex-1 truncate text-[13px] tabular-nums text-muted-foreground">
                {formatCents(line.unitPriceCents)} each
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => onRemove(line.key)}
            disabled={disabled}
            aria-label={`Remove ${line.name}`}
            className="-mr-3 flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        </div>

        {oversold ? (
          <span className="text-[12px] font-semibold text-status-overdue-fg">
            Only {Math.max(line.stockQty ?? 0, 0)} in stock — selling anyway.
          </span>
        ) : null}
      </div>
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
        "flex size-12 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors",
        "hover:bg-surface-hover active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
