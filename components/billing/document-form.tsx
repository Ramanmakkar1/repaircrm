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
import { LineItemsEditor, type InitialLine } from "./line-items-editor";
import { SubmitButton } from "./submit-button";
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
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  kind: "invoice" | "estimate";
  customers: CustomerOption[];
  products: ProductOption[];
  taxRateBps: number;
  initial?: {
    id?: string;
    customerId?: string | null;
    ticketId?: string | null;
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial?.ticketId ? (
        <input type="hidden" name="ticketId" value={initial.ticketId} />
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{isInvoice ? "Invoice details" : "Estimate details"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customerId">Customer</Label>
            <Select
              name="customerId"
              value={customerId}
              onValueChange={setCustomerId}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">{isInvoice ? "Due date" : "Expires on"}</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={initial?.date ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              {isInvoice
                ? "Optional — leave blank for due on receipt."
                : "Optional — after this date the quote is no longer honoured."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
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
        <CardContent className="px-2 py-2">
          <LineItemsEditor
            products={products}
            taxRateBps={taxRateBps}
            initialLines={initial?.lines}
            showSerial={isInvoice}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
