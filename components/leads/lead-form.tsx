"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { createLeadAction } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
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
import { LEAD_SOURCES } from "./lead-meta";
import { EMPTY_LEAD_STATE, type LeadFormState } from "./lead-state";

export type LeadFormValues = {
  name: string;
  email: string;
  phone: string;
  source: string;
  message: string;
};

export function emptyLeadValues(): LeadFormValues {
  return { name: "", email: "", phone: "", source: "Phone", message: "" };
}

/**
 * The five fields, without a `<form>` around them, so the same layout serves
 * both the /leads/new page and the edit dialog.
 *
 * Every field is CONTROLLED on purpose: React 19 resets a `<form action={…}>`
 * once the action settles, which would wipe what the front desk typed the
 * moment the server returned a validation error.
 */
export function LeadFields({
  values,
  onChange,
  errors,
  autoFocus,
}: {
  values: LeadFormValues;
  onChange: <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => void;
  errors: Record<string, string>;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
        <Input
          id="name"
          name="name"
          value={values.name}
          onChange={(event) => onChange("name", event.target.value)}
          autoFocus={autoFocus}
          maxLength={120}
          placeholder="Dana Whitfield"
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <Field label="Phone" htmlFor="phone" error={errors.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={values.phone}
          onChange={(event) => onChange("phone", event.target.value)}
          maxLength={40}
          placeholder="(512) 555-0110"
        />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          value={values.email}
          onChange={(event) => onChange("email", event.target.value)}
          maxLength={160}
          placeholder="name@example.com"
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <Field
        label="Source"
        htmlFor="source"
        error={errors.source}
        hint="Where this enquiry came from."
      >
        <Select
          name="source"
          value={values.source}
          onValueChange={(value) => onChange("source", value)}
        >
          <SelectTrigger id="source">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="What do they need?"
        htmlFor="message"
        error={errors.message}
        className="sm:col-span-2"
      >
        <Textarea
          id="message"
          name="message"
          rows={4}
          value={values.message}
          onChange={(event) => onChange("message", event.target.value)}
          maxLength={5000}
          placeholder="Cracked screen on an iPhone 14 Pro — wants a price before booking it in."
        />
      </Field>
    </div>
  );
}

/** /leads/new — the front desk logging a phone enquiry. Redirects on success. */
export function LeadForm() {
  const [state, formAction] = useActionState<LeadFormState, FormData>(
    createLeadAction,
    EMPTY_LEAD_STATE,
  );
  const [values, setValues] = React.useState<LeadFormValues>(emptyLeadValues);

  const set = React.useCallback(
    <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Enquiry</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadFields
            values={values}
            onChange={set}
            errors={state?.fieldErrors ?? {}}
            autoFocus
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link href="/leads">Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…">
          <ACTIONS.add />
          Log lead
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

