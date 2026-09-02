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
import { Textarea } from "@/components/ui/textarea";
import { defaultTaxRate, type TaxRateOption } from "@/lib/tax";
import { LineItemsEditor, type InitialLine } from "./line-items-editor";
import { SubmitButton } from "./submit-button";
import { TaxRateSelect } from "./tax-rate-select";
import { IDLE_FORM_STATE, type CustomerOption, type FormState, type ProductOption } from "./types";

/**
 * The one form behind /invoices/new, /invoices/[id]/edit, /estimates/new and
 * /estimates/[id]/edit. The only thing that varies is the date field's meaning
 * (due vs. expires) and whether lines carry a serial number.
 */
export function DocumentForm({
  action,
  kind,
  customers,
  products,
  taxRateBps,
  taxRates,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  kind: "invoice" | "estimate";
  customers: CustomerOption[];
  products: ProductOption[];
  /** The rate the document opens on — its own snapshot, or the shop default. */
  taxRateBps: number;
  /** The shop's named rates. Empty means the shop just uses one flat rate. */
  taxRates: TaxRateOption[];
  initial?: {
    id?: string;
    customerId?: string | null;
    ticketId?: string | null;
    taxRateId?: string | null;
    /** yyyy-mm-dd */
    date?: string;
    notes?: string | null;
    lines?: InitialLine[];
  };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const isInvoice = kind === "invoice";

  // Radix Select is controlled here so the customer stays picked across a
  // failed submit (the server action re-renders the form with its error).
  const [customerId, setCustomerId] = React.useState(initial?.customerId ?? "");

  // The document's tax. An existing document opens on what it snapshotted; a
  // new one follows whoever is selected, because a tax-exempt customer picked
  // three fields down must not leave a taxed total sitting on screen.
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
      {initial?.ticketId ? (
        <input type="hidden" name="ticketId" value={initial.ticketId} />
      ) : null}

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
          <CardTitle>{isInvoice ? "Invoice details" : "Estimate details"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
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
            <Label htmlFor="date">{isInvoice ? "Due date" : "Expires on"}</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={initial?.date ?? ""}
            />
            <p className="text-[13.5px] text-muted-foreground">
              {isInvoice
                ? "Optional — leave blank for due on receipt."
                : "Optional — after this date the quote is no longer honoured."}
            </p>
          </div>

          {taxRates.length > 0 ? (
            <TaxRateSelect
              rates={taxRates}
              value={tax.taxRateId}
              onChange={setTax}
              hint="Snapshotted on save — changing a rate later never restates this document."
            />
          ) : null}

          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial?.notes ?? ""}
              placeholder="Shown to the customer on the printed copy."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="px-3 py-3">
          <LineItemsEditor
            products={products}
            taxRateBps={tax.taxRateBps}
            initialLines={initial?.lines}
            showSerial={isInvoice}
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
