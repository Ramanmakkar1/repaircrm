"use client";

import * as React from "react";
import { ShopLogo } from "./shop-logo";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { updateShopAction } from "@/app/(app)/settings/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaxRateOption } from "@/lib/tax";
import { SaveBar, type SaveBarState } from "./save-bar";
import { timeZoneChoices } from "./shop-time";
import { TaxRatesCard } from "./tax-rates-card";
import { IDLE_SETTINGS_STATE, type ShopSettingsValues } from "./types";

/** 825 -> "8.25" — what a human types into a percent box. */
function bpsToPercentInput(bps: number): string {
  return String(Math.round(bps) / 100);
}

/** 9500 -> "95.00" — what a human types into a money box. */
function centsToMoneyInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

const FORM_ID = "shop-details-form";

/**
 * Shop details: identity, contact, sales tax and labour, with ONE Save pinned
 * to the bottom of the screen for all of it.
 *
 * The named tax rates sit inside the Sales tax card, where an owner looks for
 * them, and save one at a time (each has its own little sheet), which the card
 * says in words. They are rendered inside the form element but submit nothing
 * to it: their own forms open in a dialog, outside this form in the page.
 *
 * The tax rate here is the *default* new documents snapshot at creation — it
 * never restates an estimate, invoice or recurring schedule that already
 * captured a rate. That is deliberate and worth saying on screen.
 */
export function ShopTab({
  shop,
  taxRates,
}: {
  shop: ShopSettingsValues;
  taxRates: TaxRateOption[];
}) {
  const [state, formAction, pending] = useActionState(updateShopAction, IDLE_SETTINGS_STATE);
  const [dirty, setDirty] = React.useState(false);
  const zones = React.useMemo(() => timeZoneChoices(shop.timezone), [shop.timezone]);

  // Only edits to this form's own boxes count; typing in a tax-rate sheet (a
  // dialog, rendered elsewhere in the page) bubbles here through React too.
  function edited(event: React.SyntheticEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.target as Node)) setDirty(true);
  }

  const save: SaveBarState = pending ? "saving" : dirty ? "dirty" : state.done ? "saved" : "clean";

  return (
    <div className="flex flex-col gap-5">
      <ShopLogo url={shop.logoUrl} />
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <form
        id={FORM_ID}
        action={formAction}
        onInput={edited}
        onChange={edited}
        onSubmit={() => setDirty(false)}
        className="flex flex-col gap-5"
      >
        <Card>
          <CardHeader
            icon={ICONS.vendor}
            title="Your shop"
            description="The name on every receipt, and the clock your dates and times follow."
          />
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Shop name" name="name" defaultValue={shop.name} required />
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">Time zone</Label>
              {/* A native list: it posts with the form like any box, and a
                  tablet shows its own big picker for it. */}
              <select
                id="timezone"
                name="timezone"
                defaultValue={shop.timezone || "America/Edmonton"}
                className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
              >
                {zones.map((choice) => (
                  <option key={choice.zone} value={choice.zone}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <p className="text-[14px] text-muted-foreground">
                Where your shop is. &ldquo;Today&rdquo;, opening times and receipts follow it.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            icon={ICONS.location}
            title="Address & contact"
            description="Where customers find you and how they reach you."
          />
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
          <CardHeader
            icon={ICONS.tax}
            title="Sales tax"
            description="The rate new estimates, invoices and sales start with."
          />
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="taxRate">Sales tax rate</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="taxRate"
                name="taxRate"
                defaultValue={bpsToPercentInput(shop.taxRateBps)}
                inputMode="decimal"
                className="h-12 w-28 text-right text-base tabular-nums"
              />
              <span className="text-base font-semibold text-muted-foreground">%</span>
            </div>
            <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
              Changing it only affects new documents. Anything a customer has
              already been shown keeps its rate.
            </p>
          </CardContent>
        </Card>

        {/* Saves one row at a time; see the note at the top of this file. */}
        <TaxRatesCard rates={taxRates} />

        <Card>
          <CardHeader
            icon={ICONS.timeClock}
            title="Labour"
            description="What your time is worth when it is billed onto an invoice."
          />
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="labourRate">Hourly labour rate</Label>
              <div className="flex items-center gap-2.5">
                <span className="text-base font-semibold text-muted-foreground">$</span>
                <Input
                  id="labourRate"
                  name="labourRate"
                  defaultValue={centsToMoneyInput(shop.labourRateCents)}
                  inputMode="decimal"
                  className="h-12 w-32 text-right text-base tabular-nums"
                />
              </div>
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
                  className="h-12 w-24 text-right text-base tabular-nums"
                />
                <span className="text-base font-semibold text-muted-foreground">
                  minutes
                </span>
              </div>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                Always up: a 16-minute job bills as 30 at 15 minutes.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>

      <SaveBar
        state={save}
        form={FORM_ID}
        label="Save shop details"
        message={!pending && !dirty && state.error ? state.error : null}
      />
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
        className="h-12 text-base"
      />
      {hint ? (
        <p className="text-[14px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
