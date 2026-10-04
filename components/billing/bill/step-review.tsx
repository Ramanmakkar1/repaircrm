"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { IssueLines } from "@/components/tickets/intake/tiles";
import { formatCents, type Totals } from "@/lib/money";
import { formatDate } from "../format";
import {
  customerName,
  itemCount,
  itemsLabel,
  repairLabel,
  repairOf,
  type BillContext,
  type BillState,
  type Copy,
  type Issue,
} from "./flow";
import { OptionFields } from "./options";

function Row({
  label,
  value,
  empty,
  onChange,
  changeLabel,
}: {
  label: string;
  value: React.ReactNode;
  empty?: string;
  onChange?: () => void;
  changeLabel?: string;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-1">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug">
        {value || <span className="font-normal text-muted-foreground">{empty}</span>}
      </dd>
      {onChange ? (
        <Button type="button" variant="ghost" className="h-12 shrink-0 px-3 text-[15px]" aria-label={changeLabel} onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

/**
 * What is on the bill, one read-only line each: how many, what, what it comes
 * to. Shown from the wide layout up, where the live panel beside the choices
 * scrolls and so cannot be read in one go; on a phone the panel itself is drawn
 * right under the summary with every line in it.
 */
function ItemList({ state, label }: { state: BillState; label: string }) {
  if (state.lines.length === 0) return null;
  return (
    // Indented to sit under the values above it (w-24 label + gap-3).
    <ul data-review-items="" aria-label={label} className="hidden flex-col divide-y divide-border border-t border-border py-1 pl-[6.75rem] lg:flex">
      {state.lines.map((line) => {
        const serial = line.serial.trim();
        return (
          <li key={line.key} className="flex items-baseline gap-3 py-2 text-[15px]">
            <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{line.quantity} ×</span>
            <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">{line.description}</span>
              {serial ? <span className="ml-2 font-mono text-[13px] font-semibold text-accent-soft-foreground">Serial {serial}</span> : null}
              {line.taxable ? null : <span className="ml-2 text-[13px] text-muted-foreground">No tax</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatCents(line.quantity * line.unitPriceCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Step 3: the whole bill in words (with every line listed on a wide screen),
 * and the date and notes in full. The one big Save button is the panel's on a
 * wide screen and the bar's on a phone, so this step has none of its own. On a
 * phone the panel (lines, tax, total) is drawn here too, above the date and
 * notes, because nothing sits beside the choices.
 */
export function ReviewStep({
  state,
  ctx,
  copy,
  totals,
  onStep,
  onDate,
  onNotes,
  phonePanel,
  issues,
}: {
  state: BillState;
  ctx: BillContext;
  copy: Copy;
  totals: Totals;
  onStep: (step: number) => void;
  onDate: (value: string) => void;
  onNotes: (value: string) => void;
  /** The panel for a phone, which has no side column. */
  phonePanel: React.ReactNode;
  issues: Issue[];
}) {
  const id = React.useId();
  const repair = repairOf(state, ctx);
  const count = itemCount(state);
  const name = customerName(state, ctx);

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={issues.map((issue) => issue.message)} />

      <section aria-label="Summary" className="rounded-2xl border border-border bg-surface px-4 py-2 sm:px-5">
        <dl className="divide-y divide-border">
          <Row label="Customer" value={name} empty="Not chosen yet" onChange={() => onStep(0)} changeLabel="Change customer" />
          <Row
            label="Items"
            value={count > 0 ? itemsLabel(count) : ""}
            empty="Nothing added yet"
            onChange={() => onStep(1)}
            changeLabel="Change items"
          />
        </dl>
        <ItemList state={state} label={`Items on this ${copy.noun}`} />
        <dl className="divide-y divide-border border-t border-border">
          <Row
            label="Total"
            value={
              count > 0 ? (
                <>
                  {formatCents(totals.totalCents)}
                  {totals.taxCents !== 0 ? <span className="ml-2 text-[13px] font-normal text-muted-foreground">includes {formatCents(totals.taxCents)} tax</span> : null}
                </>
              ) : (
                ""
              )
            }
            empty="Nothing to bill yet"
          />
          <Row label={copy.dateLabel} value={state.date ? formatDate(state.date) : copy.dateEmpty} />
          {repair ? (
            <Row label="Repair" value={repairLabel(repair)} onChange={() => onStep(1)} changeLabel="Change repair" />
          ) : null}
          {state.notes.trim() ? <Row label="Notes" value={state.notes.trim()} /> : null}
        </dl>
      </section>

      <div className="lg:hidden">{phonePanel}</div>

      <section aria-label="Optional details" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h3 className="text-base font-semibold">Optional details</h3>
        <OptionFields
          idPrefix={`review-${id}`}
          dateLabel={copy.dateLabel}
          dateHint={copy.dateHint}
          date={state.date}
          notes={state.notes}
          onDate={onDate}
          onNotes={onNotes}
        />
      </section>

      <p className="px-1 text-[15px] text-muted-foreground">{copy.saveNote}</p>
    </div>
  );
}
