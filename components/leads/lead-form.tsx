"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Globe, MoreHorizontal, Phone, Store, Users, type LucideIcon } from "lucide-react";

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
import { MoreToggle, TILE, tone } from "@/components/tickets/intake/tiles";
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

/**
 * How an enquiry came in, as boxes. The stored value is the one the list and
 * the public form use ("Referral"); only the words on the box are friendlier.
 */
export const SOURCE_TILES: { value: (typeof LEAD_SOURCES)[number]; label: string; icon: LucideIcon }[] = [
  { value: "Phone", label: "Phone call", icon: Phone },
  { value: "Walk-in", label: "Walked in", icon: Store },
  { value: "Website", label: "Website", icon: Globe },
  { value: "Referral", label: "A friend sent them", icon: Users },
  { value: "Other", label: "Other", icon: MoreHorizontal },
];

/**
 * Easy mode's new enquiry: one screen, the way a phone call goes. Name and
 * number first (big boxes), how they got in touch as five tiles, what they
 * need, and ONE big "Save enquiry" button (pinned to the bottom on a phone).
 * Email waits behind "Add an email". Same fields, same action, same redirect.
 */
function EasyLeadForm() {
  const [state, formAction] = useActionState<LeadFormState, FormData>(
    createLeadAction,
    EMPTY_LEAD_STATE,
  );
  const [values, setValues] = React.useState<LeadFormValues>(emptyLeadValues);
  const [withEmail, setWithEmail] = React.useState(false);
  const errors = state?.fieldErrors ?? {};
  const set = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));
  const emailShown = withEmail || Boolean(values.email) || Boolean(errors.email);

  return (
    <form action={formAction} className="flex flex-col gap-6 pb-24 sm:pb-0">
      {state?.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      ) : null}

      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 sm:p-6">
        <Field label="Their name" htmlFor="name" required error={errors.name}>
          <Input
            id="name"
            name="name"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            maxLength={120}
            placeholder="Dana Whitfield"
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            className="h-14 text-lg"
          />
        </Field>
        <Field label="Phone number" htmlFor="phone" error={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            maxLength={40}
            placeholder="(512) 555-0110"
            autoComplete="off"
            className="h-14 text-lg"
          />
        </Field>
        <div className="sm:col-span-2">
          {emailShown ? (
            <Field label="Email (optional)" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
                maxLength={160}
                placeholder="name@example.com"
                autoComplete="off"
                aria-invalid={Boolean(errors.email)}
                className="h-14 text-lg"
              />
            </Field>
          ) : (
            <MoreToggle open={false} onToggle={() => setWithEmail(true)}>
              Add an email
            </MoreToggle>
          )}
        </div>
      </section>

      <section aria-labelledby="lead-source-title" className="flex flex-col gap-3">
        <h2 id="lead-source-title" className="text-lg font-semibold">How did they get in touch?</h2>
        <input type="hidden" name="source" value={values.source} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SOURCE_TILES.map((tile) => {
            const selected = values.source === tile.value;
            const Icon = tile.icon;
            return (
              <button
                key={tile.value}
                type="button"
                aria-pressed={selected}
                onClick={() => set("source", tile.value)}
                className={cn(TILE, tone(selected), "min-h-24 items-center justify-center gap-2 p-3 text-center", selected && "bg-accent-soft")}
              >
                <Icon aria-hidden className="size-7" strokeWidth={1.6} />
                <span className="text-[15px] font-semibold leading-tight">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Field label="What do they need?" htmlFor="message" error={errors.message}>
          <Textarea
            id="message"
            name="message"
            rows={3}
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            maxLength={5000}
            placeholder="Cracked screen on an iPhone 14 Pro, wants a price first."
            className="text-lg"
          />
        </Field>
      </section>

      {/* One big button: pinned to the bottom of a phone, at the end of the form on a tablet. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface p-3 sm:static sm:z-auto sm:flex sm:items-center sm:justify-end sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="ghost" asChild className="hidden h-14 px-6 text-base sm:inline-flex">
          <Link href="/leads">Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…" className="h-14 w-full text-base sm:w-auto sm:min-w-56">
          <ACTIONS.save />
          Save enquiry
        </SubmitButton>
      </div>
    </form>
  );
}

/** /leads/new — the front desk logging a phone enquiry. Redirects on success. */
export function LeadForm({ easy = false }: { easy?: boolean }) {
  if (easy) return <EasyLeadForm />;
  return <DenseLeadForm />;
}

function DenseLeadForm() {
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

