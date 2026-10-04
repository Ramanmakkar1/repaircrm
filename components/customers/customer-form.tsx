"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Building2, FileText, Mail, MapPin, MessageSquareText, Percent } from "lucide-react";

import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TaxRateSelect } from "@/components/billing/tax-rate-select";
import {
  SECTION_FIELDS,
  initialSections,
  initialValues,
  keptFields,
  openSections,
  textsFollowNumber,
  type CustomerFormValues,
  type Section,
  type TextKey,
  type Values,
} from "@/lib/customers/form-sections";
import type { TaxRateOption } from "@/lib/tax";
import { EasyCustomerForm } from "./new/easy-customer-form";

export type { CustomerFormValues };

/**
 * Counter-first customer form: a name OR a phone number is enough to save.
 * Everything else (email, address, business, notes, tax) is optional and sits
 * behind an on/off switch that reveals its fields. A new customer's switched-off
 * sections send nothing. An existing customer's keep what they hold: switching
 * one off hides it, and only emptying its fields while it shows clears them.
 *
 * Every field is CONTROLLED on purpose. React 19 resets a `<form action={…}>`
 * once the action settles; controlled values survive a validation error.
 */
function FullCustomerForm({
  customer,
  taxRates,
}: {
  customer?: CustomerFormValues | null;
  taxRates: TaxRateOption[];
}) {
  const isEdit = Boolean(customer);
  const [state, formAction] = React.useActionState<CustomerFormState, FormData>(
    isEdit ? updateCustomerAction : createCustomerAction,
    undefined,
  );
  const [values, setValues] = React.useState<Values>(() => initialValues(customer));
  const [chosen, setOpen] = React.useState<Record<Section, boolean>>(() => initialSections(initialValues(customer)));
  // "Text repair updates" follows the phone box until the person flips it by hand.
  const smsTouched = React.useRef(isEdit);

  const set = React.useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const errors = state?.fieldErrors ?? {};
  // A section with a validation error is always shown, even if switched off.
  const open = openSections(chosen, errors);
  const cancelHref = customer ? `/customers/${customer.id}` : "/customers";

  const field = (key: TextKey) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value),
  });

  const onMobile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    set("mobile", next);
    if (!smsTouched.current) set("smsOptIn", textsFollowNumber(next));
  };

  const toggle = (section: Section) => (next: boolean) => setOpen((prev) => ({ ...prev, [section]: next }));
  const big = "h-14 pointer-coarse:min-h-14 text-[17px] pointer-coarse:text-[17px] rounded-xl";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      {/* Hidden mirrors so switched-off sections keep sensible server values. */}
      {!open.email ? <input type="hidden" name="emailOptIn" value={values.emailOptIn ? "on" : ""} /> : null}
      {values.smsOptIn ? <input type="hidden" name="smsOptIn" value="on" /> : null}
      {(open.tax || isEdit) && values.taxExempt ? <input type="hidden" name="taxExempt" value="on" /> : null}
      {/* Editing: a switched-off section still posts its stored values, or saving would wipe them. */}
      {isEdit ? keptFields(SECTION_FIELDS, open, values).map(({ name, value }) => <input key={name} type="hidden" name={name} value={value} />) : null}

      {state?.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-base font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <span>{errors.name ?? state.error}</span>
        </div>
      ) : null}

      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <Field label="Name" htmlFor="name" error={errors.name ?? errors.firstName}>
          <Input
            {...field("name")}
            className={big}
            autoComplete="name"
            autoFocus={!isEdit}
            placeholder="e.g. Sarah Patel"
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Phone number" htmlFor="mobile" error={errors.mobile}>
          <Input
            id="mobile"
            name="mobile"
            value={values.mobile}
            onChange={onMobile}
            className={big}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(512) 555-0111"
          />
        </Field>
        <p className="text-sm text-muted-foreground">A name or a phone number is enough to save. Everything below is optional.</p>
      </section>

      <section aria-label="Optional details" className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        <ToggleRow
          icon={MessageSquareText}
          label="Text repair updates"
          hint={values.mobile ? "We text this number when the device is ready." : "Turns on when you add a phone number."}
          checked={values.smsOptIn}
          onChange={(next) => { smsTouched.current = true; set("smsOptIn", next); }}
        />

        <ToggleRow icon={Mail} label="Add email" hint="For receipts, estimates and invoices." checked={open.email} onChange={toggle("email")}>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input {...field("email")} className={big} type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" aria-invalid={Boolean(errors.email)} />
          </Field>
          <InlineSwitch name="emailOptIn" label="Send email updates" checked={values.emailOptIn} onChange={(next) => set("emailOptIn", next)} />
        </ToggleRow>

        <ToggleRow icon={MapPin} label="Add address" hint="For on-site jobs, delivery or statements." checked={open.address} onChange={toggle("address")}>
          <Field label="Street address" htmlFor="address1" error={errors.address1}>
            <Input {...field("address1")} className={big} autoComplete="address-line1" />
          </Field>
          <Field label="Apt / Suite" htmlFor="address2" error={errors.address2}>
            <Input {...field("address2")} className={big} autoComplete="address-line2" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="City" htmlFor="city" error={errors.city} className="sm:col-span-3">
              <Input {...field("city")} className={big} autoComplete="address-level2" />
            </Field>
            <Field label="State" htmlFor="state" error={errors.state} className="sm:col-span-1">
              <Input {...field("state")} className={big} autoComplete="address-level1" />
            </Field>
            <Field label="ZIP" htmlFor="postalCode" error={errors.postalCode} className="sm:col-span-2">
              <Input {...field("postalCode")} className={big} inputMode="numeric" autoComplete="postal-code" />
            </Field>
          </div>
        </ToggleRow>

        <ToggleRow icon={Building2} label="Business customer" hint="Company name and office phone." checked={open.business} onChange={toggle("business")}>
          <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
            <Input {...field("businessName")} className={big} autoComplete="organization" placeholder="Acme Dental Group" />
          </Field>
          <Field label="Office phone" htmlFor="phone" error={errors.phone}>
            <Input {...field("phone")} className={big} type="tel" inputMode="tel" placeholder="(512) 555-0110" />
          </Field>
        </ToggleRow>

        <ToggleRow icon={FileText} label="Add notes" hint="Anything the team should know." checked={open.notes} onChange={toggle("notes")}>
          <Field label="Notes" htmlFor="notes" error={errors.notes}>
            <Textarea {...field("notes")} rows={3} className="text-[17px]" placeholder="Prefers texts after 5pm…" />
          </Field>
          <Field label="How did they find you?" htmlFor="referredBy" error={errors.referredBy}>
            <Input {...field("referredBy")} className={big} placeholder="Google, walk-in, a friend…" />
          </Field>
        </ToggleRow>

        <ToggleRow icon={Percent} label="Tax settings" hint="Tax exempt or a different tax rate." checked={open.tax} onChange={toggle("tax")}>
          <InlineSwitch name="taxExemptSwitch" label="Tax exempt (0% tax)" checked={values.taxExempt} onChange={(next) => set("taxExempt", next)} />
          {taxRates.length > 0 && !values.taxExempt ? (
            <TaxRateSelect
              id="taxRateId"
              name="taxRateId"
              label="Tax rate"
              noneLabel="Shop default"
              rates={taxRates}
              value={values.taxRateId}
              onChange={(next) => set("taxRateId", next.taxRateId)}
            />
          ) : null}
        </ToggleRow>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" asChild className="min-h-14">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton pendingLabel="Saving…" className="min-h-14 px-8 text-base">
          {isEdit ? <ACTIONS.save /> : <ACTIONS.add />}
          {isEdit ? "Save changes" : "Save customer"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * The customer form. Easy mode (`simple`) is the counter quick add: two big
 * boxes (name, mobile number), one Save button, and a tile for each optional
 * section. Full mode keeps the compact form below. Both post the same field
 * names to the same action, and both decide what starts open and what a closed
 * section posts with the same helpers (lib/customers/form-sections.ts).
 */
export function CustomerForm({
  customer,
  taxRates,
  simple = false,
}: {
  customer?: CustomerFormValues | null;
  /** The shop's named tax rates. Empty means the shop uses one flat rate. */
  taxRates: TaxRateOption[];
  simple?: boolean;
}) {
  return simple ? <EasyCustomerForm customer={customer} taxRates={taxRates} /> : <FullCustomerForm customer={customer} taxRates={taxRates} />;
}

// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-base">{label}</Label>
      {children}
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** One optional section: a big tappable row with a switch; its fields appear when on. */
function ToggleRow({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-4 px-5 py-3 active:bg-surface-hover">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold">{label}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} className="scale-125" />
      </label>
      {checked && children ? <div className="flex flex-col gap-4 px-5 pb-5">{children}</div> : null}
    </div>
  );
}

function InlineSwitch({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <Label htmlFor={name} className="text-base font-normal">{label}</Label>
      <Switch id={name} name={name} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
