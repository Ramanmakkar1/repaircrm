import * as React from "react";
import { Check, IdCard, Mail, MapPin, Phone, Smartphone, X } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Separator } from "@/components/ui/separator";
import { formatBps, formatCents } from "@/lib/money";
import { CustomerField } from "./customer-field";
import { primaryPhone } from "./customer-facts";
import { EM_DASH, addressLines } from "./format";

export type CustomerInfo = {
  /** Needed by the inline "Referred by" field, which writes one column. */
  id: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  referredBy: string | null;
  smsOptIn: boolean;
  emailOptIn: boolean;
  createdAt: Date;
  taxExempt: boolean;
  /** The customer's own rate, when they are pinned to one. */
  taxRate: { name: string; rateBps: number } | null;
};

/**
 * `easy` is the Easy mode "Contact" section, first on the page after the
 * header. The Easy header has no editable strip, so this is where the phone and
 * email are changed in place (the same fields, written the same way): the
 * number the header dials is the one edited here, and a second number, when
 * there is one, stays a plain tap-to-call line. It also carries "Total paid",
 * which the old Easy header showed as a fact ("Customer since" is now in the
 * summary strip's last-visit pair).
 */
export function InfoCard({
  customer,
  easy = false,
  totalPaidCents,
}: {
  customer: CustomerInfo;
  easy?: boolean;
  /** Easy mode only: what they have paid the shop over time, a fact that used to sit in the header. */
  totalPaidCents?: number;
}) {
  const address = addressLines(customer);
  const main = primaryPhone(customer);
  const otherNumber = main.field === "mobile" ? customer.phone : customer.mobile;

  return (
    <Card>
      <CardHeader icon={IdCard} title={easy ? "Contact" : "Details"} />

      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <GroupLabel>How to reach them</GroupLabel>
          {easy ? (
            <dl className="flex flex-col gap-1 text-base">
              <EditRow label={main.label}>
                <CustomerField
                  customerId={customer.id}
                  field={main.field}
                  label={main.label}
                  value={main.value}
                  className="whitespace-normal"
                />
              </EditRow>
              <EditRow label="Email">
                <CustomerField
                  customerId={customer.id}
                  field="email"
                  label="Email"
                  value={customer.email ?? ""}
                  className="whitespace-normal"
                />
              </EditRow>
              {otherNumber ? (
                <EditRow label={main.field === "mobile" ? "Office phone" : "Mobile"}>
                  <a
                    href={`tel:${otherNumber}`}
                    data-touch-control
                    className="inline-flex min-h-12 items-center font-medium text-foreground hover:underline"
                  >
                    {otherNumber}
                  </a>
                </EditRow>
              ) : null}
            </dl>
          ) : (
            <>
              <ContactLine
                icon={Mail}
                value={customer.email}
                href={customer.email ? `mailto:${customer.email}` : undefined}
              />
              <ContactLine
                icon={Phone}
                value={customer.phone}
                href={customer.phone ? `tel:${customer.phone}` : undefined}
                suffix="office"
              />
              <ContactLine
                icon={Smartphone}
                value={customer.mobile}
                href={customer.mobile ? `tel:${customer.mobile}` : undefined}
                suffix="mobile"
              />
            </>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <GroupLabel>Address</GroupLabel>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
            {address.length > 0 ? (
              <div className="flex flex-col gap-0.5 text-sm text-foreground">
                {address.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-faint-foreground">No address on file</span>
            )}
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <GroupLabel>Contact preferences</GroupLabel>
          <div className="flex flex-wrap gap-2">
            <OptInChip label="Email" enabled={customer.emailOptIn} />
            <OptInChip label="SMS" enabled={customer.smsOptIn} />
          </div>
        </section>

        <Separator />

        <dl className="flex flex-col gap-2.5 text-sm">
          <Row
            label="Sales tax"
            value={
              customer.taxExempt
                ? "Tax exempt"
                : customer.taxRate
                  ? `${customer.taxRate.name} ${formatBps(customer.taxRate.rateBps)}`
                  : "Shop default"
            }
          />
          {/*
            The one editable line in this card. "How did they hear about us"
            is answered at the counter, weeks after the record was made, and
            walking the whole customer form to write four words was the reason
            it was so often left blank. The contact lines above stay read-only
            on purpose: they are `tel:`/`mailto:` links, and the header strip
            now carries the editors for phone and email.
          */}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Referred by</dt>
            <dd className="flex min-w-0 justify-end font-medium text-foreground">
              <CustomerField
                customerId={customer.id}
                field="referredBy"
                label="Referred by"
                value={customer.referredBy ?? ""}
                placeholder={EM_DASH}
                className="items-end"
              />
            </dd>
          </div>
          {easy && typeof totalPaidCents === "number" ? (
            <Row label="Total paid" value={formatCents(totalPaidCents)} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/** A label and its value on one line; the value may be an in-place editor. */
function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <dt className="text-sm text-muted-foreground sm:text-base">{label}</dt>
      {/* The editor is an inline-flex box that is as wide as its text; capping it
          at the column makes a very long email end in an ellipsis instead of
          pushing the page sideways. */}
      <dd className="min-w-0 font-medium text-foreground [&_[data-inline-edit]]:max-w-full">{children}</dd>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function ContactLine({
  icon: Icon,
  value,
  href,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | null;
  href?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-faint-foreground" />
      {value ? (
        <span className="flex min-w-0 items-baseline gap-2">
          <a
            href={href}
            className="truncate text-sm font-medium text-foreground hover:text-accent hover:underline"
          >
            {value}
          </a>
          {suffix ? (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              {suffix}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-sm text-faint-foreground">{EM_DASH}</span>
      )}
    </div>
  );
}

function OptInChip({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
        enabled
          ? "bg-status-resolved-bg text-status-resolved-fg"
          : "bg-surface-hover text-muted-foreground",
      )}
    >
      {enabled ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {label} {enabled ? "opted in" : "opted out"}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
