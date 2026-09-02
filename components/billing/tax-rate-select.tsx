"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBps } from "@/lib/money";
import { NO_TAX, type TaxRateOption } from "@/lib/tax";

/**
 * The tax picker on every billing document.
 *
 * It posts `taxRateId` — the id of the chosen rate, or the `NO_TAX` sentinel —
 * and reports the matching basis points back to the parent so the live totals
 * footer re-prices as soon as the pick changes. The server resolves the rate
 * from the id again and stores BOTH: the id for provenance, the bps as the
 * snapshot the customer was shown.
 *
 * A rate that has since been retired is still offered when the document is
 * already using it, marked "(inactive)": saving must never silently re-tax a
 * document that was quoted at 12%.
 */
export function TaxRateSelect({
  rates,
  value,
  onChange,
  id = "taxRateId",
  name = "taxRateId",
  label = "Tax",
  noneLabel = "No tax",
  hint,
}: {
  rates: TaxRateOption[];
  /** The selected rate id, or null for "No tax". */
  value: string | null;
  onChange: (next: { taxRateId: string | null; taxRateBps: number }) => void;
  id?: string;
  name?: string;
  label?: string;
  /** What the null option is called. "No tax" on a document, "Shop default"
   *  on a customer — the same absence means different things in each place. */
  noneLabel?: string;
  hint?: string;
}) {
  const options = React.useMemo(
    () => rates.filter((rate) => rate.active || rate.id === value),
    [rates, value],
  );

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        name={name}
        value={value ?? NO_TAX}
        onValueChange={(next) => {
          if (next === NO_TAX) {
            onChange({ taxRateId: null, taxRateBps: 0 });
            return;
          }
          const rate = rates.find((option) => option.id === next);
          onChange({
            taxRateId: rate?.id ?? null,
            taxRateBps: rate?.rateBps ?? 0,
          });
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64 overflow-y-auto">
          <SelectItem value={NO_TAX}>{noneLabel}</SelectItem>
          {options.map((rate) => (
            <SelectItem key={rate.id} value={rate.id}>
              {rate.name} · {formatBps(rate.rateBps)}
              {rate.active ? "" : " (inactive)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? (
        <p className="text-[13.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
