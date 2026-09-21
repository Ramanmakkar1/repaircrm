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
import { NewCustomerFields, NewDeviceFields, PromisedTimeField } from "./intake-fields";

export type Option = { value: string; label: string };

/** A past purchase still under warranty, offered when a claim is flagged. */
export type WarrantyOption = {
  value: string;
  label: string;
  /** "Invoice #1042 · expires Nov 3" — the line under the description. */
  hint: string;
};

/**
 * New-ticket intake form.
 *
 * The asset list is narrowed to the chosen customer from a map handed down by
 * the server — one query at page load instead of a fetch on every customer
 * change. Only display-safe asset fields are in that map; `Asset.password`
 * (the device unlock code) never leaves the server.
 */
export function TicketForm({
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
}: {
  customers: Option[];
  assetsByCustomer: Record<string, Option[]>;
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
}) {
  const [state, formAction, pending] = useActionState(
    createTicketAction,
    EMPTY_STATE,
  );

  const [customerId, setCustomerId] = React.useState(defaultCustomerId ?? (customers.length ? "" : "__new__"));
  const [assetId, setAssetId] = React.useState("none");
  const [isWarranty, setIsWarranty] = React.useState(false);
  const [warrantyLineId, setWarrantyLineId] = React.useState("none");

  const assets = customerId ? (assetsByCustomer[customerId] ?? []) : [];
  const warranties = customerId ? (warrantiesByCustomer[customerId] ?? []) : [];

  return (
    <form action={formAction}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" htmlFor="customerId" required>
              <Select
                name="customerId"
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  // The previous device — and the previous warranty — belong
                  // to the previous customer.
                  setAssetId("none");
                  setWarrantyLineId("none");
                  setIsWarranty(false);
                }}
              >
                <SelectTrigger id="customerId">
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__new__">+ New customer</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.value} value={customer.value}>
                      {customer.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Device"
              htmlFor="assetId"
              hint={
                customerId && assets.length === 0
                  ? "No devices on file for this customer."
                  : undefined
              }
            >
              <Select
                name="assetId"
                value={assetId}
                onValueChange={setAssetId}
                disabled={!customerId}
              >
                <SelectTrigger id="assetId">
                  <SelectValue placeholder="No device" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No device</SelectItem>
                  <SelectItem value="__new__">+ New device</SelectItem>
                  {assets.map((asset) => (
                    <SelectItem key={asset.value} value={asset.value}>
                      {asset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {customerId === "__new__" ? <NewCustomerFields /> : null}
          {assetId === "__new__" ? <NewDeviceFields /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quoted price" htmlFor="quotedPrice"><Input id="quotedPrice" name="quotedPrice" type="number" min="0" step="0.01" placeholder="Optional" /></Field>
            <Field label="Inspection fee" htmlFor="inspectionFee"><Input id="inspectionFee" name="inspectionFee" type="number" min="0" step="0.01" placeholder="0.00" /></Field>
            <label className="flex items-center gap-2 self-center text-sm"><input type="checkbox" name="termsAccepted" /> Customer accepted the shop&apos;s repair terms</label>
          </div>

          <Field label="Subject" htmlFor="subject" required>
            <Input
              id="subject"
              name="subject"
              required
              maxLength={200}
              placeholder="iPhone 14 Pro — cracked screen, touch dead on left edge"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Problem type" htmlFor="problemType" required>
              <Select name="problemType" defaultValue={problemTypes[0]}>
                <SelectTrigger id="problemType">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {problemTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

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
        </CardContent>

        <CardFooter className="justify-end">
          <Button asChild variant="ghost" size="sm" type="button">
            <Link href="/tickets">Cancel</Link>
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            <ACTIONS.add />
            {pending ? "Creating…" : "Create ticket"}
          </Button>
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
