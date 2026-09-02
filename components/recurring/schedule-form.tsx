"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { LineItemsEditor, type InitialLine } from "@/components/billing/line-items-editor";
import { SubmitButton } from "@/components/billing/submit-button";
import { TaxRateSelect } from "@/components/billing/tax-rate-select";
import { defaultTaxRate, type TaxRateOption } from "@/lib/tax";
import {
  IDLE_FORM_STATE,
  type CustomerOption,
  type FormState,
  type ProductOption,
} from "@/components/billing/types";
import { FREQUENCY_OPTIONS } from "./meta";

/**
 * The one form behind /invoices/recurring/new and /invoices/recurring/[id]/edit.
 *
 * The line editor is `components/billing/line-items-editor` unchanged — a
 * recurring line carries exactly the same shape as an invoice line minus the
 * serial number, which the editor already knows how to drop (`showSerial`).
 * Reusing it means the live totals here are computed by the same `calcTotals`
 * the generated invoice will be totalled with.
 */
export function ScheduleForm({
  action,
  customers,
  products,
  taxRateBps,
  taxRates,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  customers: CustomerOption[];
  products: ProductOption[];
  /** The rate the schedule opens on — its own snapshot, or the shop default. */
  taxRateBps: number;
  /** The shop's named rates. Empty means the shop just uses one flat rate. */
  taxRates: TaxRateOption[];
  initial?: {
    id?: string;
    name?: string;
    customerId?: string | null;
    taxRateId?: string | null;
    frequency?: string;
    /** yyyy-mm-dd */
    nextRunAt?: string;
    dueInDays?: number;
    active?: boolean;
    autoCharge?: boolean;
    autoSend?: boolean;
    lines?: InitialLine[];
  };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  // Radix Select/Switch are controlled so the picks survive a failed submit
  // (the server action re-renders this form with its error).
  const [customerId, setCustomerId] = React.useState(initial?.customerId ?? "");
  const [frequency, setFrequency] = React.useState(initial?.frequency ?? "MONTHLY");
  const [active, setActive] = React.useState(initial?.active ?? true);
  const [autoCharge, setAutoCharge] = React.useState(initial?.autoCharge ?? false);
  const [autoSend, setAutoSend] = React.useState(initial?.autoSend ?? false);

  // Auto-charge needs somewhere to charge. The switch is disabled rather than
  // hidden, with the reason next to it, because "why can't I turn this on?" is
  // the question a hidden control cannot answer.
  const chosen = customers.find((c) => c.id === customerId) ?? null;
  const customerHasCard = Boolean(chosen?.hasCard);
  const chargeReady = customerHasCard && autoCharge;

  // Same rule as a one-off invoice: an existing schedule keeps the rate it
  // snapshotted, a new one follows whoever is selected.
  const [tax, setTax] = React.useState<{
    taxRateId: string | null;
    taxRateBps: number;
  }>(() => {
    // A saved document keeps its own snapshot.
    if (initial?.id) {
      return { taxRateId: initial.taxRateId ?? null, taxRateBps };
    }
    // A new one that already knows its customer (prefilled from the customer or
    // ticket screen) opens on that customer's rate…
    const prefill = customers.find((c) => c.id === initial?.customerId) ?? null;
    if (prefill) {
      return { taxRateId: prefill.taxRateId, taxRateBps: prefill.taxRateBps };
    }
    // …and one that does not opens on the shop default, which is what it would
    // have been taxed at before this picker existed.
    const fallback = defaultTaxRate(taxRates);
    return fallback
      ? { taxRateId: fallback.id, taxRateBps: fallback.rateBps }
      : { taxRateId: null, taxRateBps };
  });

  function selectCustomer(nextId: string) {
    setCustomerId(nextId);
    const customer = customers.find((c) => c.id === nextId);
    if (customer) {
      setTax({
        taxRateId: customer.taxRateId,
        taxRateBps: customer.taxRateBps,
      });
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="active" value={active ? "true" : "false"} />
      <input
        type="hidden"
        name="autoCharge"
        value={chargeReady ? "true" : "false"}
      />
      <input type="hidden" name="autoSend" value={autoSend ? "true" : "false"} />

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Schedule details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Schedule name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={initial?.name ?? ""}
              placeholder="Managed IT retainer"
              maxLength={120}
              required
            />
            <p className="text-[13.5px] text-muted-foreground">
              Internal only — the customer never sees it.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customerId">Customer</Label>
            <Select
              name="customerId"
              value={customerId}
              onValueChange={selectCustomer}
              required
            >
              <SelectTrigger id="customerId">
                <SelectValue placeholder="Choose a customer…" />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="frequency">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nextRunAt">
              {initial?.id ? "Next run date" : "First run date"}
            </Label>
            <Input
              id="nextRunAt"
              name="nextRunAt"
              type="date"
              defaultValue={initial?.nextRunAt ?? ""}
              required
            />
            <p className="text-[13.5px] text-muted-foreground">
              Later runs step forward from this date, not from when you press run.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dueInDays">Payment terms</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="dueInDays"
                name="dueInDays"
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                className="w-24 text-right tabular-nums"
                defaultValue={String(initial?.dueInDays ?? 14)}
              />
              <span className="text-sm text-muted-foreground">days to pay</span>
            </div>
            <p className="text-[13.5px] text-muted-foreground">
              0 means due on receipt.
            </p>
          </div>

          {taxRates.length > 0 ? (
            <TaxRateSelect
              rates={taxRates}
              value={tax.taxRateId}
              onChange={setTax}
              hint="Every invoice this schedule raises is taxed at this rate."
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="active">Status</Label>
            <div className="flex h-10 items-center gap-3">
              <Switch
                id="active"
                checked={active}
                onCheckedChange={setActive}
                aria-label="Schedule active"
              />
              <span className="text-sm font-semibold text-foreground">
                {active ? "Active" : "Paused"}
              </span>
            </div>
            <p className="text-[13.5px] text-muted-foreground">
              Paused schedules are skipped by &ldquo;Generate due now&rdquo;.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happens on each run</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleRow
            id="autoSend"
            checked={autoSend}
            onChange={setAutoSend}
            title="Email the invoice automatically"
            detail="The generated invoice is emailed to the customer as soon as it is raised, instead of waiting in Drafts for someone to send it."
          />
          <ToggleRow
            id="autoCharge"
            checked={chargeReady}
            onChange={setAutoCharge}
            disabled={!customerHasCard}
            title="Charge card on file automatically"
            detail={
              customerHasCard
                ? "The balance is taken from the saved card the moment the invoice is raised. A decline is reported on this schedule and emailed to the shop owner."
                : "This customer has no card on file. Save one from their customer page to enable this."
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What gets billed each time</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-3">
          <LineItemsEditor
            products={products}
            taxRateBps={tax.taxRateBps}
            initialLines={initial?.lines}
            showSerial={false}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="lg" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton size="lg" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * One labelled switch with its consequence spelled out underneath.
 *
 * Both of these toggles cause something to happen to a customer while nobody
 * is watching — an email leaving, a card being charged — so neither gets to be
 * a bare switch with a two-word label.
 */
function ToggleRow({
  id,
  checked,
  onChange,
  title,
  detail,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-lg border border-border bg-surface-hover px-4 py-3.5">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className="text-[14.5px] font-bold">
          {title}
        </Label>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
