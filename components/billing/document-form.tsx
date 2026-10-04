"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultTaxRate, type TaxRateOption } from "@/lib/tax";
import { EntryMode } from "@/components/ui/entry-mode";
import { CustomerCombobox } from "@/components/customers/customer-combobox";
import { LineItemsEditor, type InitialLine } from "./line-items-editor";
import { SubmitButton } from "@/components/ui/submit-button";
import { TaxRateSelect } from "./tax-rate-select";
import { IDLE_FORM_STATE, parseLines, submittedLinesSchema, type CustomerOption, type FormState, type ProductOption } from "./types";
import { calcTotals, formatCents } from "@/lib/money";
import { GuidedErrors, GuidedNavigation, GuidedReview, GuidedSteps, useGuidedForm, type GuidedIssue } from "@/components/ui/guided-form";
import { BillBuilder } from "./bill/builder";
import type { RepairOption } from "./bill/flow";

export type DocumentFormProps = {
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
    /** A saved document's own snapshotted rate (0 is a real rate: no tax). */
    taxRateBps?: number;
    /** yyyy-mm-dd */
    date?: string;
    notes?: string | null;
    lines?: InitialLine[];
  };
  submitLabel: string;
  cancelHref: string;
  simple?: boolean;
  /** Easy mode, new documents only: the shop's open repairs, for "From repair". */
  repairs?: RepairOption[];
  /** Easy mode, new documents only: who was billed most recently, to tap on step 1. */
  recentCustomerIds?: string[];
  /** Easy mode: the page's title block, drawn at the top of the builder's choices. */
  header?: React.ReactNode;
  /** Easy mode: a plain-words note under the title (e.g. "Already sent to Elena"). */
  notice?: React.ReactNode;
  /** Easy mode, a new invoice opened for a repair: put its unbilled charges on the bill. */
  withRepairCharges?: boolean;
};

/**
 * The one form behind /invoices/new, /invoices/[id]/edit, /estimates/new and
 * /estimates/[id]/edit. The only thing that varies is the date field's meaning
 * (due vs. expires) and whether lines carry a serial number.
 *
 * In Easy mode a document, new or saved, is the bill builder
 * (components/billing/bill): a sibling of the Sell screen and the new-repair
 * check-in. A saved one opens it in edit mode (on Check and save, posting its
 * `id`). It posts the same fields to the same actions as the form below, which
 * Full mode keeps exactly as it was.
 */
export function DocumentForm(props: DocumentFormProps) {
  if (props.simple) {
    const { action, kind, customers, products, taxRateBps, taxRates, repairs, recentCustomerIds, initial, header, notice } = props;
    const editing = Boolean(initial?.id);
    return (
      <BillBuilder
        action={action}
        kind={kind}
        customers={customers}
        products={products}
        taxRateBps={taxRateBps}
        taxRates={taxRates}
        repairs={editing ? [] : repairs}
        recentCustomerIds={recentCustomerIds}
        header={header}
        notice={notice}
        mode={editing ? "edit" : "new"}
        documentId={initial?.id}
        initial={{
          customerId: initial?.customerId,
          ticketId: initial?.ticketId,
          date: initial?.date,
          notes: initial?.notes,
          lines: initial?.lines,
          // A saved document keeps its own tax snapshot until someone picks another rate.
          tax: editing ? { taxRateId: initial?.taxRateId ?? null, taxRateBps: initial?.taxRateBps ?? taxRateBps } : undefined,
          withRepairCharges: !editing && props.withRepairCharges,
        }}
      />
    );
  }
  return (
    <>
      {props.header}
      <ClassicDocumentForm {...props} />
    </>
  );
}

function ClassicDocumentForm({
  action,
  kind,
  customers,
  products,
  taxRateBps,
  taxRates,
  initial,
  submitLabel,
  cancelHref,
  simple = false,
}: DocumentFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  const isInvoice = kind === "invoice";
  const [guided, setGuided] = React.useState(false);
  const staged = simple && guided;

  // Controlled so the customer stays picked across a failed submit (the server
  // action re-renders the form with its error).
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

  const { bindForm, step: activeStep, issues: guidedIssues, review, goTo, onSubmit, onKeyDown, focusIssue, refreshReview } = useGuidedForm({ enabled: simple, staged, steps: 3, validate(data, step) {
    const issues: GuidedIssue[] = [];
    if (step === 0 && !String(data.get("customerId") ?? "").trim()) {
      issues.push({ step, field: "Customer", label: "Customer", message: "Choose a customer or add a new one." });
    }
    if (step === 0 && String(data.get("customerId")) === "new") {
      const email = String(data.get("newCustomerEmail") ?? "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ step, field: "newCustomerEmail", label: "Customer email", message: "Enter a valid email address or leave it blank." });
    }
    if (step === 1) {
      const lines = parseLines(data.get("lines"));
      if (!lines.ok) {
        let raw: unknown = [];
        try { raw = JSON.parse(String(data.get("lines") ?? "[]")); } catch { /* A malformed payload is handled by parseLines. */ }
        const parsed = submittedLinesSchema.safeParse(raw);
        const issue = parsed.success ? undefined : parsed.error.issues[0];
        const fieldName = String(issue?.path[1] ?? "description");
        const labels: Record<string, string> = { description: "Description", quantity: "Quantity", unitPriceCents: "Unit price", serial: "Serial number" };
        const field = labels[fieldName] ?? "Description";
        issues.push({ step, field, label: typeof issue?.path[0] === "number" ? "Item " + (issue.path[0] + 1) + " · " + field.toLowerCase() : "Line items", message: lines.error });
      }
      else {
        const missingSerial = lines.lines.find((line) => products.find((product) => product.id === line.productId)?.serialized && isInvoice && (!line.serial || line.quantity !== 1));
        if (missingSerial) issues.push({ step, field: "Serial number", label: "Serial number", message: "Choose one unit per line for a serialized product." });
      }
    }
    return issues;
  } });
  const reviewValue = (name: string) => String(review?.get(name) ?? "");
  const reviewLines = parseLines(review?.get("lines") ?? null);
  const totals = calcTotals(reviewLines.ok ? reviewLines.lines : [], tax.taxRateBps);

  return (
    <form ref={bindForm} action={formAction} noValidate={simple} onSubmit={onSubmit} onKeyDown={onKeyDown} onInput={staged && activeStep === 2 ? () => requestAnimationFrame(refreshReview) : undefined} onReset={simple ? (event) => event.preventDefault() : undefined} className="flex flex-col gap-5">
      {staged ? <GuidedSteps labels={["Customer", "Items", "Review & save"]} step={activeStep} onStep={goTo} disabled={pending} /> : null}
      {simple ? <EntryMode guided={guided} onChange={setGuided} disabled={pending} /> : null}
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

      {staged ? <div><h2 data-guided-heading tabIndex={-1} className="text-2xl font-semibold outline-none">{["Who are you billing?", "Add products or services", "Review this " + kind][activeStep]}</h2><p className="mt-1 text-sm text-muted-foreground">{["Search for a customer or add someone new.", "Add each item, quantity, price, and serial number where needed.", "Check the total, then save your draft."][activeStep]}</p></div> : null}
      <Card hidden={staged && activeStep === 1} className={staged && activeStep === 1 ? "hidden" : undefined}>
        <CardHeader
          icon={isInvoice ? ICONS.invoice : ICONS.estimate}
          title={simple ? !staged || activeStep === 0 ? "Customer" : "Additional details" : isInvoice ? "Invoice details" : "Estimate details"}
        />
        <CardContent className="grid gap-5 sm:grid-cols-3">
          {/* Its own row: search results and the new-customer fields need the width. */}
          <div data-guided-step="0" hidden={staged && activeStep !== 0} className={staged && activeStep !== 0 ? "hidden" : "flex flex-col gap-2 sm:col-span-3"}>
            <Label>Customer</Label>
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={selectCustomer}
              // A saved document keeps its customer's history; switching a draft
              // to a brand-new person is a new document, not an edit.
              allowNew={!initial?.id}
              invalid={simple && guidedIssues.some((issue) => issue.step === 0)}
            />
          </div>
          <details data-guided-step="2" hidden={staged && activeStep !== 2} open={!simple} className={staged && activeStep !== 2 ? "hidden" : simple ? "sm:col-span-3" : "contents"}>
            <summary className={simple ? "flex min-h-12 cursor-pointer items-center text-sm font-semibold" : "hidden"}>Due date, tax, and printed notes</summary>
            <div className={simple ? "grid gap-5 pt-3 sm:grid-cols-3" : "contents"}>
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
              hint="Saved with this document. Changing the rate in Settings later never changes it."
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
          </div>
          </details>
        </CardContent>
      </Card>

      <Card data-guided-step="1" hidden={staged && activeStep !== 1} className={staged && activeStep !== 1 ? "hidden" : undefined}>
        <CardHeader icon={ICONS.checklist} title="Line items" />
        <CardContent className="px-3 py-3">
          <LineItemsEditor
            products={products}
            taxRateBps={tax.taxRateBps}
            initialLines={initial?.lines}
            showSerial={isInvoice}
            simple={simple}
          />
        </CardContent>
      </Card>

      {staged && activeStep === 2 ? <div className="flex flex-col gap-4">
        <GuidedReview rows={[
          { label: "Customer", value: customerId === "new" ? (reviewValue("newCustomerName") || reviewValue("newCustomerPhone")) : customers.find((customer) => customer.id === customerId)?.label },
          { label: isInvoice ? "Due date" : "Expires", value: reviewValue("date") || (isInvoice ? "Due on receipt" : "No expiry date") },
          { label: "Notes", value: reviewValue("notes") || "No printed notes" },
        ]} />
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-base font-semibold">Items</h3>
          <ul className="mt-2 divide-y divide-border">{reviewLines.ok ? reviewLines.lines.map((line, index) => <li key={index} className="flex items-start justify-between gap-4 py-3 text-sm"><div><p className="font-medium">{line.description}</p><p className="mt-1 text-muted-foreground">{line.quantity} × {formatCents(line.unitPriceCents)}{line.serial ? " · " + line.serial : ""}</p></div><span className="font-semibold">{formatCents(line.quantity * line.unitPriceCents)}</span></li>) : null}</ul>
          <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCents(totals.subtotalCents)}</dd></div><div className="flex justify-between"><dt>Tax</dt><dd>{formatCents(totals.taxCents)}</dd></div><div className="flex justify-between text-xl font-semibold"><dt>Total</dt><dd>{formatCents(totals.totalCents)}</dd></div></dl>
        </div>
        <p className="text-sm text-muted-foreground">This saves a draft. You can review it before sending it to the customer.</p>
      </div> : null}
      {<GuidedErrors issues={guidedIssues} step={staged ? activeStep : undefined} onFocus={focusIssue} />}
      {staged ? <GuidedNavigation step={activeStep} lastStep={2} onStep={goTo} disabled={pending}>
        <Button variant="ghost" className="min-h-12" asChild><Link href="/counter">Cancel</Link></Button>
        {activeStep === 2 ? <SubmitButton className="min-h-12 px-6" pendingLabel="Saving…"><ACTIONS.save /> {submitLabel}</SubmitButton> : null}
      </GuidedNavigation> : <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="lg" asChild>
          <Link href={simple ? "/counter" : cancelHref}>
            <ACTIONS.cancel /> Cancel
          </Link>
        </Button>
        <SubmitButton size="lg" pendingLabel="Saving…">
          <ACTIONS.save /> {submitLabel}
        </SubmitButton>
      </div>}
    </form>
  );
}
