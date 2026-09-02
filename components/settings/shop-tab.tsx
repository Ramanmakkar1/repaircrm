"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { updateShopAction } from "@/app/(app)/settings/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import type { TaxRateOption } from "@/lib/tax";
import { TaxRatesCard } from "./tax-rates-card";
import { IDLE_SETTINGS_STATE, type ShopSettingsValues } from "./types";

const SaveIcon = ACTIONS.save;

/** 825 -> "8.25" — what a human types into a percent box. */
function bpsToPercentInput(bps: number): string {
  return String(Math.round(bps) / 100);
}

/** 9500 -> "95.00" — what a human types into a money box. */
function centsToMoneyInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/**
 * Shop identity, contact details and the default tax rate.
 *
 * The tax rate here is the *default* new documents snapshot at creation — it
 * never restates an estimate, invoice or recurring schedule that already
 * captured a rate. That is deliberate and worth saying on screen, because
 * "I changed the tax rate and nothing changed" is otherwise a support ticket.
 */
export function ShopTab({
  shop,
  taxRates,
}: {
  shop: ShopSettingsValues;
  taxRates: TaxRateOption[];
}) {
  const [state, formAction] = useActionState(updateShopAction, IDLE_SETTINGS_STATE);

  return (
    <div className="flex flex-col gap-5">
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.message ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md bg-status-resolved-bg px-4 py-3 text-sm font-semibold text-status-resolved-fg"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader icon={ICONS.vendor} title="Shop identity" />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Shop name" name="name" defaultValue={shop.name} required />
          <Field
            label="Timezone"
            name="timezone"
            defaultValue={shop.timezone}
            hint="IANA name, e.g. America/Edmonton."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader icon={ICONS.location} title="Address & contact" />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Address line 1"
            name="address1"
            defaultValue={shop.address1}
            className="sm:col-span-2"
          />
          <Field
            label="Address line 2"
            name="address2"
            defaultValue={shop.address2}
            className="sm:col-span-2"
          />
          <Field label="City" name="city" defaultValue={shop.city} />
          <Field label="State / province" name="state" defaultValue={shop.state} />
          <Field label="Postal code" name="postalCode" defaultValue={shop.postalCode} />
          <Field label="Country" name="country" defaultValue={shop.country} />
          <Field label="Phone" name="phone" defaultValue={shop.phone} type="tel" />
          <Field label="Email" name="email" defaultValue={shop.email} type="email" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader icon={ICONS.tax} title="Billing defaults" />
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="taxRate">Sales tax rate</Label>
          <div className="flex items-center gap-2.5">
            <Input
              id="taxRate"
              name="taxRate"
              defaultValue={bpsToPercentInput(shop.taxRateBps)}
              inputMode="decimal"
              className="w-28 text-right tabular-nums"
            />
            <span className="text-sm font-semibold text-muted-foreground">%</span>
          </div>
          <p className="max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
            Applied to taxable lines on documents created from now on. Estimates,
            invoices and recurring schedules each snapshot the rate when they are
            created, so changing it here never restates a document a customer has
            already been shown.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader icon={ICONS.timeClock} title="Labour" />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="labourRate">Hourly labour rate</Label>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-muted-foreground">$</span>
              <Input
                id="labourRate"
                name="labourRate"
                defaultValue={centsToMoneyInput(shop.labourRateCents)}
                inputMode="decimal"
                className="w-32 text-right tabular-nums"
              />
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              What a stopped timer is worth per hour when it is billed onto an
              invoice.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="labourRounding">Round time up to</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="labourRounding"
                name="labourRounding"
                type="number"
                min={1}
                max={240}
                step={1}
                defaultValue={String(shop.labourRoundingMinutes)}
                className="w-24 text-right tabular-nums"
              />
              <span className="text-sm font-semibold text-muted-foreground">
                minutes
              </span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Always up, never down — a 16-minute job bills as 30 at a
              15-minute increment.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Saving…">
          <SaveIcon aria-hidden />
          Save shop details
        </SubmitButton>
      </div>
    </form>

    {/* Outside the form above: these rows save one at a time, and a form
        nested inside a form is invalid HTML. */}
    <TaxRatesCard rates={taxRates} />
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  hint,
  type = "text",
  required,
  className,
}: {
  label: string;
  name: string;
  defaultValue: string;
  hint?: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
      {hint ? (
        <p className="text-[13.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
