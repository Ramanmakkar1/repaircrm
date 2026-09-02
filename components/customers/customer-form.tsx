"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TaxRateSelect } from "@/components/billing/tax-rate-select";
import type { TaxRateOption } from "@/lib/tax";

export type CustomerFormValues = {
  id: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  referredBy: string | null;
  notes: string | null;
  smsOptIn: boolean;
  emailOptIn: boolean;
  taxExempt: boolean;
  taxRateId: string | null;
};

type TextKey =
  | "firstName"
  | "lastName"
  | "businessName"
  | "email"
  | "phone"
  | "mobile"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "referredBy"
  | "notes";

type Values = Record<TextKey, string> & {
  smsOptIn: boolean;
  emailOptIn: boolean;
  taxExempt: boolean;
  taxRateId: string | null;
};

function initialValues(customer?: CustomerFormValues | null): Values {
  return {
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    businessName: customer?.businessName ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    mobile: customer?.mobile ?? "",
    address1: customer?.address1 ?? "",
    address2: customer?.address2 ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    postalCode: customer?.postalCode ?? "",
    referredBy: customer?.referredBy ?? "",
    notes: customer?.notes ?? "",
    smsOptIn: customer?.smsOptIn ?? false,
    emailOptIn: customer?.emailOptIn ?? true,
    taxExempt: customer?.taxExempt ?? false,
    taxRateId: customer?.taxRateId ?? null,
  };
}

/**
 * One form, two routes: /customers/new posts to createCustomerAction and
 * /customers/[id]/edit posts to updateCustomerAction. Both redirect on success,
 * so the only state this ever renders is the validation failure path.
 *
 * Every field is CONTROLLED on purpose. React 19 resets a `<form action={…}>`
 * once the action settles, which would wipe a long intake form the moment the
 * server returned a validation error. Controlled values survive that reset.
 */
export function CustomerForm({
  customer,
  taxRates,
}: {
  customer?: CustomerFormValues | null;
  /** The shop's named tax rates. Empty means the shop uses one flat rate. */
  taxRates: TaxRateOption[];
}) {
  const isEdit = Boolean(customer);
  const [state, formAction] = React.useActionState<CustomerFormState, FormData>(
    isEdit ? updateCustomerAction : createCustomerAction,
    undefined,
  );
  const [values, setValues] = React.useState<Values>(() => initialValues(customer));

  const set = React.useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const errors = state?.fieldErrors ?? {};
  const cancelHref = customer ? `/customers/${customer.id}` : "/customers";

  const field = (key: TextKey) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value),
  });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

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
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
            <Input
              {...field("firstName")}
              autoComplete="given-name"
              autoFocus={!isEdit}
              aria-invalid={Boolean(errors.firstName)}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
            <Input
              {...field("lastName")}
              autoComplete="family-name"
              aria-invalid={Boolean(errors.lastName)}
            />
          </Field>
          <Field
            label="Business name"
            htmlFor="businessName"
            error={errors.businessName}
            className="sm:col-span-2"
            hint="Leave blank for individual customers."
          >
            <Input
              {...field("businessName")}
              autoComplete="organization"
              placeholder="Acme Dental Group"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor="email"
            error={errors.email}
            className="sm:col-span-2"
          >
            <Input
              {...field("email")}
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input
              {...field("phone")}
              type="tel"
              autoComplete="tel"
              placeholder="(512) 555-0110"
            />
          </Field>
          <Field label="Mobile" htmlFor="mobile" error={errors.mobile}>
            <Input {...field("mobile")} type="tel" placeholder="(512) 555-0111" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-6">
          <Field
            label="Street address"
            htmlFor="address1"
            error={errors.address1}
            className="sm:col-span-6"
          >
            <Input {...field("address1")} autoComplete="address-line1" />
          </Field>
          <Field
            label="Apt / Suite"
            htmlFor="address2"
            error={errors.address2}
            className="sm:col-span-6"
          >
            <Input {...field("address2")} autoComplete="address-line2" />
          </Field>
          <Field
            label="City"
            htmlFor="city"
            error={errors.city}
            className="sm:col-span-3"
          >
            <Input {...field("city")} autoComplete="address-level2" />
          </Field>
          <Field
            label="State"
            htmlFor="state"
            error={errors.state}
            className="sm:col-span-1"
          >
            <Input {...field("state")} autoComplete="address-level1" />
          </Field>
          <Field
            label="ZIP"
            htmlFor="postalCode"
            error={errors.postalCode}
            className="sm:col-span-2"
          >
            <Input {...field("postalCode")} autoComplete="postal-code" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field
            label="Referred by"
            htmlFor="referredBy"
            error={errors.referredBy}
            hint="Where did this customer come from?"
          >
            <Input
              {...field("referredBy")}
              placeholder="Google, walk-in, existing customer…"
            />
          </Field>

          <Field label="Notes" htmlFor="notes" error={errors.notes}>
            <Textarea
              {...field("notes")}
              rows={4}
              placeholder="Anything the team should know before they pick up the phone."
            />
          </Field>

          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-hover/60 p-4">
            <OptIn
              name="taxExempt"
              label="Tax exempt"
              hint="Their estimates, invoices and counter sales are taxed at 0%."
              checked={values.taxExempt}
              onChange={(next) => set("taxExempt", next)}
            />
            {taxRates.length > 0 && !values.taxExempt ? (
              <TaxRateSelect
                id="taxRateId"
                name="taxRateId"
                label="Preferred tax rate"
                noneLabel="Shop default"
                rates={taxRates}
                value={values.taxRateId}
                onChange={(next) => set("taxRateId", next.taxRateId)}
                hint="Pin this customer to one rate — out-of-state, wholesale, a different province."
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-hover/60 p-4">
            <OptIn
              name="emailOptIn"
              label="Email updates"
              hint="Send ticket status emails, estimates and invoices."
              checked={values.emailOptIn}
              onChange={(next) => set("emailOptIn", next)}
            />
            <OptIn
              name="smsOptIn"
              label="SMS updates"
              hint="Text the customer when their device is ready."
              checked={values.smsOptIn}
              onChange={(next) => set("smsOptIn", next)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…">
          {isEdit ? <ACTIONS.save /> : <ACTIONS.add />}
          {isEdit ? "Save changes" : "Create customer"}
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
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

function OptIn({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={name} name={name} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

