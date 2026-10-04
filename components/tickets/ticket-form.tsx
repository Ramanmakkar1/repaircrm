"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createTicketAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE } from "./action-state";
import { PRIORITIES, PRIORITY_META } from "./ticket-meta";
import { NewDeviceFields, PromisedTimeField } from "./intake-fields";
import { GuidedErrors, GuidedNavigation, GuidedReview, GuidedSteps, useGuidedForm, type GuidedIssue } from "@/components/ui/guided-form";
import { CustomerCombobox, type ComboCustomer } from "@/components/customers/customer-combobox";
import { EntryMode } from "@/components/ui/entry-mode";
import { newCustomerSchema, newDeviceSchema, repairSubject } from "@/lib/intake";
import { deviceIntakeProfile } from "@/lib/device-intake";
import { EasyCheckIn } from "./intake/checkin";
import type { AssetOption, Option, WarrantyOption } from "./intake/flow";

/**
 * `Option` is a value and its label. `WarrantyOption` is a past purchase still
 * under warranty, offered when a claim is flagged ("hint" is the line under it:
 * "Invoice #1042 · expires Nov 3"). `AssetOption` is a saved device with its
 * display-safe type, make and model. They live with the Easy-mode check-in.
 */
export type { AssetOption, Option, WarrantyOption };

export type TicketFormProps = {
  customers: ComboCustomer[];
  assetsByCustomer: Record<string, AssetOption[]>;
  techs: Option[];
  problemTypes: string[];
  defaultCustomerId?: string;
  /** Active branches. Fewer than two and the picker is not rendered at all. */
  locations?: Option[];
  defaultLocationId?: string;
  /** Saved checklists, for the optional override of the automatic one. */
  checklists?: Option[];
  /** Still-live warranted purchases, per customer. */
  warrantiesByCustomer?: Record<string, WarrantyOption[]>;
  /** "Due 3 days out at Normal priority" — what an empty date will become. */
  slaHint?: string;
  /** Easy mode: the POS-style check-in. Off: the full form below. */
  simple?: boolean;
};

/**
 * New-ticket intake. Easy mode is the step-by-step check-in (components/tickets/intake/);
 * Full mode is the single form below, unchanged.
 */
export function TicketForm({ simple = false, ...props }: TicketFormProps) {
  return simple ? <EasyCheckIn {...props} /> : <FullTicketForm {...props} />;
}

/**
 * The Full-mode intake form.
 *
 * The asset list is narrowed to the chosen customer from a map handed down by
 * the server — one query at page load instead of a fetch on every customer
 * change. Only display-safe asset fields are in that map; `Asset.password`
 * (the device unlock code) never leaves the server.
 */
function FullTicketForm({
  customers,
  assetsByCustomer,
  techs,
  problemTypes,
  defaultCustomerId,
  locations = [],
  defaultLocationId,
  checklists = [],
  warrantiesByCustomer = {},
  slaHint,
}: Omit<TicketFormProps, "simple">) {
  // Only reached in Full mode (Easy mode has its own check-in above). The
  // `simple` branches below are the ones Full mode never takes; they are left
  // in place so this stays the form Full mode has always had.
  const simple = false;
  const [state, formAction, pending] = useActionState(
    createTicketAction,
    EMPTY_STATE,
  );

  const [guided, setGuided] = React.useState(false);
  const staged = simple && guided;
  const [customerId, setCustomerId] = React.useState(defaultCustomerId ?? "");
  const [assetId, setAssetId] = React.useState(defaultCustomerId && !assetsByCustomer[defaultCustomerId]?.length ? "__new__" : "none");
  const [problemType, setProblemType] = React.useState("");
  const [customSubject, setCustomSubject] = React.useState<string | null>(null);
  const [deviceIdentity, setDeviceIdentity] = React.useState({ type: "Phone", make: "", model: "" });
  const [isWarranty, setIsWarranty] = React.useState(false);
  const [warrantyLineId, setWarrantyLineId] = React.useState("none");

  const assets = customerId ? (assetsByCustomer[customerId] ?? []) : [];
  const warranties = customerId ? (warrantiesByCustomer[customerId] ?? []) : [];

  const { bindForm, step: activeStep, issues: guidedIssues, review, goTo, onSubmit, onKeyDown, focusIssue } = useGuidedForm({ enabled: simple, staged, steps: 3, validate(data, step) {
    const issues: GuidedIssue[] = [];
    const value = (name: string) => String(data.get(name) ?? "").trim();
    if (step === 0 && !String(data.get("customerId") ?? "").trim()) {
      issues.push({ step, field: "customerId", label: "Customer", message: "Choose a customer or add a new one." });
    }
    if (step === 0 && value("customerId") === "__new__") {
      const parsed = newCustomerSchema.safeParse({ name: value("newCustomerName"), email: value("newCustomerEmail").toLowerCase(), phone: value("newCustomerPhone") });
      if (!parsed.success) parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0]);
        const fields: Record<string, string> = { name: "newCustomerName", email: "newCustomerEmail", phone: "newCustomerPhone" };
        issues.push({ step, field: fields[key] ?? "newCustomerName", label: "Customer " + key, message: issue.message });
      });
    }
    if (step === 1 && value("assetId") === "__new__") {
      const parsed = newDeviceSchema.safeParse({ type: value("newDeviceType"), make: value("newDeviceMake"), model: value("newDeviceModel"), serial: value("newDeviceSerial"), password: String(data.get("newDevicePassword") ?? "") });
      if (!parsed.success) parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0]);
        const fields: Record<string, string> = { type: "newDeviceType", make: "newDeviceMake", model: "newDeviceModel", serial: "newDeviceSerial", password: "newDevicePassword" };
        issues.push({ step, field: fields[key] ?? "newDeviceType", label: "Device " + key, message: issue.message });
      });
    }
    if (step === 1 && !String(data.get("problemType") ?? "").trim()) {
      issues.push({ step, field: "problemType", label: "Problem type", message: "Choose the kind of repair." });
    }
    if (step === 1) ["quotedPrice", "inspectionFee"].forEach((field) => {
      if (value(field) && (!Number.isFinite(Number(value(field))) || Number(value(field)) < 0 || Number(value(field)) > 1_000_000)) issues.push({ step, field, label: field === "quotedPrice" ? "Quoted price" : "Inspection fee", message: "Enter a price from 0 to 1,000,000." });
    });
    return issues;
  } });
  const reviewValue = (name: string) => String(review?.get(name) ?? "");

  const deviceName = assetId === "__new__"
    ? [deviceIdentity.make, deviceIdentity.model].filter(Boolean).join(" ") || deviceIdentity.type
    : (assets.find((asset) => asset.value === assetId)?.label.split(" · ")[0] ?? "");
  const subject = customSubject ?? repairSubject(deviceName, problemType);
  const commonProblems = assetId === "__new__" ? deviceIntakeProfile(deviceIdentity.type).problems : problemTypes.slice(0, 6);
  const availableProblems = Array.from(new Set([...commonProblems, ...problemTypes, "Other Repair", ...(problemType ? [problemType] : [])]));
  function selectCustomer(value: string) {
    setCustomerId(value);
    setDeviceIdentity({ type: "Phone", make: "", model: "" });
    setAssetId(value && !assetsByCustomer[value]?.length ? "__new__" : "none");
    setWarrantyLineId("none");
    setIsWarranty(false);
  }

  const deviceField = <Field label="Device" htmlFor="assetId" hint={customerId && assets.length === 0 ? "No devices on file for this customer." : undefined}>
    <Select name="assetId" value={assetId} onValueChange={setAssetId} disabled={!customerId}>
      <SelectTrigger id="assetId"><SelectValue placeholder="No device" /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="none">No device</SelectItem><SelectItem value="__new__">+ New device</SelectItem>
        {assets.map((asset) => <SelectItem key={asset.value} value={asset.value}>{asset.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </Field>;

  return (
    <form ref={bindForm} action={formAction} noValidate={simple} onSubmit={onSubmit} onKeyDown={onKeyDown} onReset={simple ? (event) => event.preventDefault() : undefined} className={simple ? "flex flex-col gap-4" : undefined}>
      {staged ? <GuidedSteps labels={["Customer", "Device & repair", "Review & save"]} step={activeStep} onStep={goTo} disabled={pending} /> : null}
      {simple ? <EntryMode guided={guided} onChange={setGuided} disabled={pending} /> : null}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          {state?.error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          {staged ? <div><h2 data-guided-heading tabIndex={-1} className="text-2xl font-semibold outline-none">{["Who is this repair for?", "What needs repairing?", "Review this repair"][activeStep]}</h2><p className="mt-1 text-sm text-muted-foreground">{["Choose someone on file or add their details here.", "Add the device, problem, and any repair instructions.", "Check the details, then create the repair."][activeStep]}</p></div> : null}
          <div data-guided-step="0" hidden={staged && activeStep !== 0} className={staged && activeStep !== 0 ? "hidden" : "contents"}>
          <div className={simple ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
            <Field label="Customer" htmlFor="customerId" required>
              <CustomerCombobox id="customerId" customers={customers} value={customerId} onChange={selectCustomer} newValue="__new__" invalid={guidedIssues.some((issue) => issue.field === "customerId")} />
            </Field>

            {!simple ? deviceField : null}
          </div>

          </div>
          <div data-guided-step="1" hidden={staged && activeStep !== 1} className={staged && activeStep !== 1 ? "hidden" : "contents"}>
          {simple ? deviceField : null}
          {assetId === "__new__" ? <NewDeviceFields key={customerId} onIdentityChange={next => { if (next.type !== deviceIdentity.type) setProblemType(""); setDeviceIdentity(next); }} /> : null}

          <div className={simple ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
          {!simple ? <>
            <Field label="Quoted price" htmlFor="quotedPrice"><Input id="quotedPrice" name="quotedPrice" type="number" min="0" step="0.01" placeholder="Optional" /></Field>
            <Field label="Inspection fee" htmlFor="inspectionFee"><Input id="inspectionFee" name="inspectionFee" type="number" min="0" step="0.01" placeholder="0.00" /></Field>
            <label className="flex items-center gap-2 self-center text-sm"><input type="checkbox" name="termsAccepted" /> Customer accepted the shop&apos;s repair terms</label>
          </> : null}
          </div>


          <div className="grid gap-4 sm:grid-cols-2">
          <div className={simple ? "sm:col-span-2" : "contents"}>
            <Field label="Problem type" htmlFor="problemType" required>
              <Select name="problemType" value={problemType} onValueChange={setProblemType}>
                <SelectTrigger id="problemType">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {availableProblems.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-base font-semibold">What&apos;s wrong?</p>
            <div role="group" aria-label="Common problems" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {commonProblems.map((type) => <Button key={type} type="button" variant={problemType === type ? "default" : "outline"} className="min-h-16 rounded-xl text-base" aria-pressed={problemType === type} onClick={() => setProblemType(type)}>{type}</Button>)}
            </div>
          <Field label="Repair summary" htmlFor="subject" required hint="Filled from the device and problem you choose. Edit it to add specifics.">
            <Input
              id="subject"
              name="subject"
              value={subject}
              onChange={(event) => setCustomSubject(event.target.value)}
              required
              maxLength={200}
              placeholder="iPhone 14 Pro — cracked screen, touch dead on left edge"
            />
          </Field>

          </div>
          <details open={!simple} className={simple ? "rounded-lg border border-border p-4 sm:col-span-2" : "contents"}>
            <summary className={simple ? "flex min-h-12 cursor-pointer items-center text-sm font-semibold" : "hidden"}>More repair details · price, pickup, technician</summary>
          <div className={simple ? "grid gap-4 sm:grid-cols-2" : "contents"}>
            {simple ? <>
              <Field label="Quoted price" htmlFor="quotedPrice"><Input id="quotedPrice" name="quotedPrice" type="number" min="0" step="0.01" placeholder="Optional" /></Field>
              <Field label="Inspection fee" htmlFor="inspectionFee"><Input id="inspectionFee" name="inspectionFee" type="number" min="0" step="0.01" placeholder="0.00" /></Field>
              <label className="flex min-h-12 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="termsAccepted" /> Customer accepted the shop&apos;s repair terms</label>
            </> : null}
            <Field label="Priority" htmlFor="priority">
              <Select name="priority" defaultValue="NORMAL">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Assign to" htmlFor="assignedToId">
              <Select name="assignedToId" defaultValue="none">
                <SelectTrigger id="assignedToId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {techs.map((tech) => (
                    <SelectItem key={tech.value} value={tech.value}>
                      {tech.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <PromisedTimeField hint={slaHint} />

            {locations.length > 1 ? (
              <Field label="Location" htmlFor="locationId">
                <Select name="locationId" defaultValue={defaultLocationId}>
                  <SelectTrigger id="locationId">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {locations.map((location) => (
                      <SelectItem key={location.value} value={location.value}>
                        {location.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {checklists.length > 0 ? (
              <Field
                label="Checklist"
                htmlFor="checklistTemplateId"
                hint="Automatic picks the checklist saved for this problem type."
              >
                <Select name="checklistTemplateId" defaultValue="auto">
                  <SelectTrigger id="checklistTemplateId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="auto">Automatic</SelectItem>
                    <SelectItem value="none">No checklist</SelectItem>
                    {checklists.map((checklist) => (
                      <SelectItem key={checklist.value} value={checklist.value}>
                        {checklist.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
          </details>
          </div>

          {/* Warranty claim. Hidden entirely until a customer with a live
              warranty is chosen — most tickets are not claims, and an empty
              picker is just a question nobody can answer. */}
          {warranties.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-hover/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="isWarranty">Warranty claim</Label>
                  <p className="text-[13px] text-muted-foreground">
                    This customer has {warranties.length} purchase
                    {warranties.length === 1 ? "" : "s"} still under warranty.
                  </p>
                </div>
                <Switch
                  id="isWarranty"
                  checked={isWarranty}
                  onCheckedChange={(next) => {
                    setIsWarranty(next);
                    if (!next) setWarrantyLineId("none");
                  }}
                />
              </div>

              {isWarranty ? (
                <Select
                  name="warrantyInvoiceLineId"
                  value={warrantyLineId}
                  onValueChange={setWarrantyLineId}
                >
                  <SelectTrigger aria-label="Warranted purchase">
                    <SelectValue placeholder="Which purchase?" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Not chosen yet</SelectItem>
                    {warranties.map((warranty) => (
                      <SelectItem key={warranty.value} value={warranty.value}>
                        {warranty.label} · {warranty.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}

          <Field label="Diagnostic notes" htmlFor="diagnosticNotes">
            <Textarea
              id="diagnosticNotes"
              name="diagnosticNotes"
              rows={4}
              placeholder="What the customer reported, what you observed at the counter…"
            />
          </Field>
          </div>
          {staged ? <div data-guided-step="2" hidden={activeStep !== 2} className={activeStep !== 2 ? "hidden" : undefined}>
            <GuidedReview className="border-0 px-0" rows={[
              { label: "Customer", value: customerId === "__new__" ? (reviewValue("newCustomerName") || reviewValue("newCustomerPhone")) : customers.find((customer) => customer.id === customerId)?.label },
              { label: "Device", value: assetId === "__new__" ? [reviewValue("newDeviceType"), reviewValue("newDeviceMake"), reviewValue("newDeviceModel")].filter(Boolean).join(" · ") : assets.find((asset) => asset.value === assetId)?.label ?? "No device attached" },
              { label: "Repair", value: reviewValue("subject") }, { label: "Problem type", value: reviewValue("problemType") },
              { label: "Priority", value: PRIORITY_META[reviewValue("priority") as keyof typeof PRIORITY_META]?.label ?? "Normal" },
              { label: "Quoted price", value: reviewValue("quotedPrice") ? "$" + reviewValue("quotedPrice") : "Not quoted yet" },
              { label: "Inspection fee", value: reviewValue("inspectionFee") ? "$" + reviewValue("inspectionFee") : "$0.00" },
              { label: "Promised pickup", value: reviewValue("promisedAt") ? new Date(reviewValue("promisedAt")).toLocaleString() : "Shop's standard repair target" },
              { label: "Warranty", value: isWarranty ? warranties.find((warranty) => warranty.value === warrantyLineId)?.label ?? "No purchase chosen" : "Not a warranty claim" },
              { label: "Repair notes", value: reviewValue("diagnosticNotes") || "No notes" },
            ]} />
            <p className="mt-3 text-sm text-muted-foreground">You can go back to change anything. Creating this repair saves all the details you entered.</p>
          </div> : null}
          {<GuidedErrors issues={guidedIssues} step={staged ? activeStep : undefined} onFocus={focusIssue} />}
        </CardContent>

        <CardFooter className={simple ? "block" : "justify-end"}>
          {staged ? <GuidedNavigation step={activeStep} lastStep={2} onStep={goTo} disabled={pending}>
            <Button asChild variant="ghost" className="min-h-12"><Link href="/counter">Cancel</Link></Button>
            {activeStep === 2 ? <Button type="submit" disabled={pending} className="min-h-12 px-6"><ACTIONS.add />{pending ? "Creating…" : "Create repair"}</Button> : null}
          </GuidedNavigation> : <>
          <Button asChild variant="ghost" size="sm" type="button">
            <Link href={simple ? "/counter" : "/tickets"}>Cancel</Link>
          </Button>
          <Button type="submit" size={simple ? "lg" : "sm"} disabled={pending}>
            <ACTIONS.add />
            {pending ? "Creating…" : "Create repair"}
          </Button>
          </>}
        </CardFooter>
      </Card>
    </form>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
