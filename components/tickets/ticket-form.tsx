"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
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
import { createTicketAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE } from "./action-state";
import { PRIORITIES, PRIORITY_META } from "./ticket-meta";

export type Option = { value: string; label: string };

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
}: {
  customers: Option[];
  assetsByCustomer: Record<string, Option[]>;
  techs: Option[];
  problemTypes: string[];
  defaultCustomerId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createTicketAction,
    EMPTY_STATE,
  );

  const [customerId, setCustomerId] = React.useState(defaultCustomerId ?? "");
  const [assetId, setAssetId] = React.useState("none");

  const assets = customerId ? (assetsByCustomer[customerId] ?? []) : [];

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          {state?.error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
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
                  // The previous device belongs to the previous customer.
                  setAssetId("none");
                }}
              >
                <SelectTrigger id="customerId">
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
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
                disabled={!customerId || assets.length === 0}
              >
                <SelectTrigger id="assetId">
                  <SelectValue placeholder="No device" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No device</SelectItem>
                  {assets.map((asset) => (
                    <SelectItem key={asset.value} value={asset.value}>
                      {asset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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

            <Field label="Due date" htmlFor="dueDate">
              <Input id="dueDate" name="dueDate" type="date" />
            </Field>
          </div>

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
            {pending ? "Creating…" : "Create Ticket"}
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
