import * as React from "react";
import { Check, IdCard, Mail, MapPin, Phone, Smartphone, X } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Separator } from "@/components/ui/separator";
import { formatBps } from "@/lib/money";
import { EM_DASH, addressLines } from "./format";

export type CustomerInfo = {
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

export function InfoCard({ customer }: { customer: CustomerInfo }) {
  const address = addressLines(customer);

  return (
    <Card>
      <CardHeader icon={IdCard} title="Details" />

      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <GroupLabel>How to reach them</GroupLabel>
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
          <Row label="Referred by" value={customer.referredBy ?? EM_DASH} />
          {/* "Customer since" is a column in the header's metadata strip now.
              One fact, one place — repeating it here just made the reader
              check whether the two agreed. */}
        </dl>
      </CardContent>
    </Card>
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
