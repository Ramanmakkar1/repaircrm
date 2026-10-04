"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from "@/app/(app)/customers/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaxRateSelect } from "@/components/billing/tax-rate-select";
import {
  SECTION_FIELDS,
  displayName,
  hasNameOrNumber,
  initialSections,
  initialValues,
  keptFields,
  openSections,
  summaryRows,
  textsFollowNumber,
  type CustomerFormValues,
  type Section,
  type TextKey,
  type Values,
} from "@/lib/customers/form-sections";
import type { TaxRateOption } from "@/lib/tax";
import { BIG_INPUT, FIELD_INPUT, Field, InlineSwitch, SECTION_TILES, SectionCard, SectionTile, TextUpdatesRow } from "./parts";
import { MobileBar, SummaryPanel } from "./summary";

/**
 * The Easy-mode customer form, the counter's quick add: two huge boxes (name,
 * mobile number), a live picture, one big Save button, and five tiles that
 * switch the optional sections on.
 *
 * The rules are the full form's, field for field: the same names go to the same
 * action; a new customer's switched-off sections send nothing; an existing
 * customer's switched-off sections still post what they hold (keptFields), so
 * hiding a section never wipes it; a section with a validation error shows
 * itself. Every field is CONTROLLED, because React 19 resets a `<form
 * action={…}>` once the action settles and a refused save must keep what was typed.
 */
export function EasyCustomerForm({
  customer,
  taxRates,
}: {
  customer?: CustomerFormValues | null;
  /** The shop's named tax rates. Empty means the shop uses one flat rate. */
  taxRates: TaxRateOption[];
}) {
  const isEdit = Boolean(customer);
  const [state, formAction, pending] = React.useActionState<CustomerFormState, FormData>(
    isEdit ? updateCustomerAction : createCustomerAction,
    undefined,
  );
  const [values, setValues] = React.useState<Values>(() => initialValues(customer));
  const [chosen, setChosen] = React.useState<Record<Section, boolean>>(() => initialSections(initialValues(customer)));
  /** The section the person just switched on: its first box takes the cursor. */
  const [justOpened, setJustOpened] = React.useState<Section | null>(null);
  // "Text updates" follows the mobile box until the person flips it by hand.
  const smsTouched = React.useRef(isEdit);

  const mobileRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);

  const set = React.useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) => setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const errors = state?.fieldErrors ?? {};
  const open = openSections(chosen, errors);
  const cancelHref = customer ? `/customers/${customer.id}` : "/customers";
  const saveLabel = isEdit ? "Save changes" : "Save customer";

  // A refused save brings its message into view, and the cursor to the name box when that is what it needs.
  React.useEffect(() => {
    if (!state?.error) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alertRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    if (state.fieldErrors?.name) nameRef.current?.focus({ preventScroll: true });
  }, [state]);

  const field = (key: TextKey) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value),
  });

  const onMobile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    set("mobile", next);
    if (!smsTouched.current) set("smsOptIn", textsFollowNumber(next));
  };

  const toggleSection = (section: Section) => {
    const next = !open[section];
    setChosen((prev) => ({ ...prev, [section]: next }));
    setJustOpened(next ? section : null);
  };

  // Enter in the name box means "next": on to the number. Enter in the number box saves (the browser's own submit).
  const onNameKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    mobileRef.current?.focus();
  };

  // A second Enter or tap while the first save is still going must not save twice.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
  };

  const who = displayName(values);
  // Under the name: the number, unless the name already is the number.
  const shownMobile = values.name.trim() ? values.mobile : "";
  const hint = hasNameOrNumber(values, open.business || isEdit) ? null : "Add a name or a mobile number to save.";
  const rows = summaryRows(values, open, taxRates);

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      {/* Hidden mirrors so switched-off sections keep sensible server values. */}
      {!open.email ? <input type="hidden" name="emailOptIn" value={values.emailOptIn ? "on" : ""} /> : null}
      {values.smsOptIn ? <input type="hidden" name="smsOptIn" value="on" /> : null}
      {(open.tax || isEdit) && values.taxExempt ? <input type="hidden" name="taxExempt" value="on" /> : null}
      {/* Editing: a switched-off section still posts its stored values, or saving would wipe them. */}
      {isEdit ? keptFields(SECTION_FIELDS, open, values).map(({ name, value }) => <input key={name} type="hidden" name={name} value={value} />) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {state?.error ? (
            <div
              ref={alertRef}
              role="alert"
              className="flex scroll-mt-28 scroll-mb-44 items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-base font-medium text-destructive"
            >
              <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
              <span>{errors.name ?? state.error}</span>
            </div>
          ) : null}

          <section aria-label="Who is the customer" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <Field label="Name" htmlFor="name" error={errors.name ?? errors.firstName} big>
              <Input
                {...field("name")}
                ref={nameRef}
                onKeyDown={onNameKey}
                className={BIG_INPUT}
                autoComplete="name"
                autoFocus={!isEdit}
                enterKeyHint="next"
                placeholder="e.g. Sarah Patel"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <Field label="Mobile number" htmlFor="mobile" error={errors.mobile} hint="A name or a mobile number is enough." big>
              <Input
                id="mobile"
                name="mobile"
                ref={mobileRef}
                value={values.mobile}
                onChange={onMobile}
                className={BIG_INPUT}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="done"
                placeholder="(512) 555-0111"
                aria-invalid={Boolean(errors.mobile)}
              />
            </Field>
            <TextUpdatesRow
              on={values.smsOptIn}
              hasNumber={values.mobile.trim() !== ""}
              onChange={(next) => {
                smsTouched.current = true;
                set("smsOptIn", next);
              }}
            />
          </section>

          <section aria-labelledby="cf-more" className="flex flex-col gap-3">
            <h2 id="cf-more" className="text-lg font-semibold">
              Add more <span className="text-sm font-normal text-muted-foreground">(optional)</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SECTION_TILES.map((tile) => (
                <SectionTile
                  key={tile.section}
                  icon={tile.icon}
                  title={tile.title}
                  open={open[tile.section]}
                  onToggle={() => toggleSection(tile.section)}
                  // Five boxes: two by two and one wide on a phone, all in one row from a tablet up.
                  className={tile.section === "tax" ? "col-span-2 sm:col-span-1" : undefined}
                />
              ))}
            </div>
          </section>

          {open.email ? (
            <SectionCard icon={SECTION_TILES[0].icon} heading={SECTION_TILES[0].heading}>
              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input
                  {...field("email")}
                  className={FIELD_INPUT}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus={justOpened === "email"}
                  placeholder="name@example.com"
                  aria-invalid={Boolean(errors.email)}
                />
              </Field>
              <InlineSwitch name="emailOptIn" label="Send email updates" checked={values.emailOptIn} onChange={(next) => set("emailOptIn", next)} />
            </SectionCard>
          ) : null}

          {open.address ? (
            <SectionCard icon={SECTION_TILES[1].icon} heading={SECTION_TILES[1].heading}>
              <Field label="Street address" htmlFor="address1" error={errors.address1}>
                <Input {...field("address1")} className={FIELD_INPUT} autoComplete="address-line1" autoFocus={justOpened === "address"} />
              </Field>
              <Field label="Apt / Suite" htmlFor="address2" error={errors.address2}>
                <Input {...field("address2")} className={FIELD_INPUT} autoComplete="address-line2" />
              </Field>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                <Field label="City" htmlFor="city" error={errors.city} className="col-span-2 sm:col-span-3">
                  <Input {...field("city")} className={FIELD_INPUT} autoComplete="address-level2" />
                </Field>
                <Field label="State" htmlFor="state" error={errors.state} className="sm:col-span-1">
                  <Input {...field("state")} className={FIELD_INPUT} autoComplete="address-level1" />
                </Field>
                <Field label="ZIP" htmlFor="postalCode" error={errors.postalCode} className="sm:col-span-2">
                  <Input {...field("postalCode")} className={FIELD_INPUT} inputMode="numeric" autoComplete="postal-code" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {open.business ? (
            <SectionCard icon={SECTION_TILES[2].icon} heading={SECTION_TILES[2].heading}>
              <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
                <Input {...field("businessName")} className={FIELD_INPUT} autoComplete="organization" autoFocus={justOpened === "business"} placeholder="Acme Dental Group" />
              </Field>
              <Field label="Office phone" htmlFor="phone" error={errors.phone}>
                <Input {...field("phone")} className={FIELD_INPUT} type="tel" inputMode="tel" placeholder="(512) 555-0110" />
              </Field>
            </SectionCard>
          ) : null}

          {open.notes ? (
            <SectionCard icon={SECTION_TILES[3].icon} heading={SECTION_TILES[3].heading}>
              <Field label="Notes" htmlFor="notes" error={errors.notes}>
                <Textarea {...field("notes")} rows={3} className="rounded-xl px-4 py-3 text-[17px]!" autoFocus={justOpened === "notes"} placeholder="Prefers texts after 5pm…" />
              </Field>
              <Field label="How did they find you?" htmlFor="referredBy" error={errors.referredBy}>
                <Input {...field("referredBy")} className={FIELD_INPUT} placeholder="Google, walk-in, a friend…" />
              </Field>
            </SectionCard>
          ) : null}

          {open.tax ? (
            <SectionCard icon={SECTION_TILES[4].icon} heading={SECTION_TILES[4].heading}>
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
            </SectionCard>
          ) : null}
        </div>

        <aside aria-label="This customer" className="hidden lg:sticky lg:top-2 lg:block">
          <SummaryPanel name={who} mobile={shownMobile} rows={rows} hint={hint} saveLabel={saveLabel} cancelHref={cancelHref} />
        </aside>
      </div>

      <MobileBar name={who} mobile={shownMobile} hint={hint ? "Add a name or number" : null} saveLabel={saveLabel} />
    </form>
  );
}
