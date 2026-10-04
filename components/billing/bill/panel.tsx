"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatCents, type Totals } from "@/lib/money";
import { SELECT_CLASS } from "./dialogs";
import {
  customerName,
  isUnitLine,
  itemCount,
  itemsLabel,
  taxChoices,
  taxName,
  type BillContext,
  type BillState,
  type Copy,
} from "./flow";
import { LineRow } from "./line-row";
import { OptionFields } from "./options";

/**
 * "This invoice" / "This estimate": what is being billed, live. The customer
 * (with a Change), every line with its big minus and plus, the tax, the total,
 * "More options" for the due date and notes, and the one big button. When the
 * button cannot be pressed yet it says why in plain words, and pressing it
 * anyway takes you to the step that is missing something.
 *
 * Only the lines scroll. "More options", the tax, the total and the button
 * stay in view under them, so the totals are never pushed out of sight by a
 * long bill. Opening "More options" puts its fields at the end of the lines
 * and scrolls them into view.
 *
 * Drawn three times from one component: beside the choices on a wide screen,
 * in the phone's "Your items" sheet, and (without the button) on the Review
 * step of a phone.
 */
export function BillPanel({
  state,
  ctx,
  copy,
  totals,
  onStep,
  onQuantity,
  onRemove,
  onEdit,
  onTax,
  onDate,
  onNotes,
  reason,
  pending,
  showActions = true,
  showOptions = true,
  showHeading = true,
  idPrefix,
  className,
}: {
  state: BillState;
  ctx: BillContext;
  copy: Copy;
  totals: Totals;
  onStep: (step: number) => void;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onEdit: (key: string) => void;
  onTax: (taxRateId: string | null) => void;
  onDate: (value: string) => void;
  onNotes: (value: string) => void;
  /** Why saving is not possible yet, or null when it is. */
  reason: string | null;
  pending: boolean;
  /** Off where the phone's bar carries the button instead. */
  showActions?: boolean;
  /** Off where the Review step shows the date and notes in full. */
  showOptions?: boolean;
  /** Off in the phone's sheet, whose title already says it. */
  showHeading?: boolean;
  /** Keeps the ids of two copies of the panel apart. */
  idPrefix: string;
  className?: string;
}) {
  const [more, setMore] = React.useState(false);
  const fieldsRef = React.useRef<HTMLDivElement>(null);
  const name = customerName(state, ctx);
  const count = itemCount(state);
  const choices = taxChoices(ctx, state.taxRateId);
  const empty = state.lines.length === 0;

  // The fields open under the lines, and the toggle is under those: bring them into view.
  React.useEffect(() => {
    if (!more) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fieldsRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [more]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4", className)}>
      <div className="flex min-h-12 shrink-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          {showHeading ? (
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight">
              {copy.panel}
              {count > 0 ? (
                <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[13px] font-semibold tabular-nums text-accent-soft-foreground">{itemsLabel(count)}</span>
              ) : null}
            </h2>
          ) : null}
          <p className="truncate text-[15px] leading-snug text-muted-foreground">
            {name ? <>For <span className="font-semibold text-foreground">{name}</span></> : "No customer yet"}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-12 shrink-0 px-4 text-[15px]" aria-label={name ? "Change customer" : "Choose a customer"} onClick={() => onStep(0)}>
          {name ? "Change" : "Choose"}
        </Button>
      </div>

      {/* Only the lines (and the fields "More options" opens) scroll; everything under them stays put. */}
      <div data-bill-lines="" className="flex min-h-[5.5rem] flex-1 flex-col overflow-y-auto border-t border-border">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-6 text-center">
            <p className="text-[16px] font-semibold text-foreground">Nothing here yet</p>
            <p className="text-[14px] leading-snug text-muted-foreground">Tap a picture to add it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {state.lines.map((line) => (
              <LineRow
                key={line.key}
                line={line}
                product={line.productId ? ctx.products.find((product) => product.id === line.productId) : undefined}
                unit={isUnitLine(line, ctx.kind, ctx.products)}
                onQuantity={(quantity) => onQuantity(line.key, quantity)}
                onEdit={() => onEdit(line.key)}
                onRemove={() => onRemove(line.key)}
              />
            ))}
          </ul>
        )}
        {showOptions && more ? (
          <div ref={fieldsRef} className="shrink-0 border-t border-border pb-1 pt-3">
            <OptionFields
              idPrefix={idPrefix}
              dateLabel={copy.dateLabel}
              dateHint={copy.dateHint}
              date={state.date}
              notes={state.notes}
              onDate={onDate}
              onNotes={onNotes}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border pt-2">
        <div className={cn("flex items-center justify-between gap-3", showOptions ? "min-h-12" : "min-h-8")}>
          {showOptions ? (
            <button
              type="button"
              data-bill-more=""
              aria-expanded={more}
              onClick={() => setMore((open) => !open)}
              className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-[15px] font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              More options
              <span aria-hidden className="text-lg leading-none text-muted-foreground">{more ? "−" : "+"}</span>
            </button>
          ) : (
            <span />
          )}
          <dl className="flex items-baseline gap-3">
            <dt className="text-[14px] text-muted-foreground">Subtotal</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{formatCents(totals.subtotalCents)}</dd>
          </dl>
        </div>
        <dl className="flex flex-col">
          <div className="flex min-h-12 items-center justify-between gap-3">
            <dt className="shrink-0 text-[14px] text-muted-foreground">
              {ctx.taxRates.length > 0 ? <label htmlFor={`${idPrefix}-tax`}>Tax</label> : "Tax"}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center justify-end gap-3">
              {ctx.taxRates.length > 0 ? (
                <select
                  id={`${idPrefix}-tax`}
                  value={state.taxRateId ?? ""}
                  onChange={(event) => onTax(event.target.value === "" ? null : event.target.value)}
                  className={cn(SELECT_CLASS, "w-auto min-w-0 flex-1 truncate px-2.5 text-[14px]")}
                >
                  <option value="">No tax</option>
                  {choices.map((rate) => (
                    <option key={rate.id} value={rate.id}>{taxName({ ...state, taxRateId: rate.id }, ctx)}{rate.active ? "" : " (inactive)"}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[14px] text-muted-foreground">{taxName(state, ctx)}</span>
              )}
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCents(totals.taxCents)}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
            <dt className="text-[16px] font-bold">Total</dt>
            <dd className="text-[28px] font-bold leading-9 tabular-nums tracking-tight">{formatCents(totals.totalCents)}</dd>
          </div>
        </dl>
      </div>

      {showActions ? (
        <div className="flex shrink-0 flex-col gap-2 lg:pr-12 xl:pr-0">
          {reason ? (
            <p id={`${idPrefix}-reason`} role="status" className="text-[15px] font-medium leading-snug text-muted-foreground">{reason}</p>
          ) : null}
          <Button
            type="submit"
            disabled={pending}
            aria-disabled={reason ? true : undefined}
            aria-describedby={reason ? `${idPrefix}-reason` : undefined}
            className={cn("h-14 w-full text-base", reason && "opacity-60")}
          >
            {pending ? copy.saving : copy.save}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
