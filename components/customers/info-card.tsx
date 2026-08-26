import * as React from "react";
import { Check, IdCard, Mail, MapPin, Phone, Smartphone, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Separator } from "@/components/ui/separator";
import { EM_DASH, addressLines, formatDate } from "./format";

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
};

export function InfoCard({ customer }: { customer: CustomerInfo }) {
  const address = addressLines(customer);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <IdCard className="size-3.5 text-muted-foreground" />
          Details
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
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
        </div>

        <Separator />

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-faint-foreground" />
          {address.length > 0 ? (
            <div className="flex flex-col text-[13px] text-foreground">
              {address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-faint-foreground">No address on file</span>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <OptInChip label="Email" enabled={customer.emailOptIn} />
          <OptInChip label="SMS" enabled={customer.smsOptIn} />
        </div>

        <Separator />

        <dl className="flex flex-col gap-1.5 text-[13px]">
          <Row label="Referred by" value={customer.referredBy ?? EM_DASH} />
          <Row label="Customer since" value={formatDate(customer.createdAt)} />
        </dl>
      </CardContent>
    </Card>
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
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-faint-foreground" />
      {value ? (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <a
            href={href}
            className="truncate text-[13px] text-foreground hover:text-accent hover:underline"
          >
            {value}
          </a>
          {suffix ? (
            <span className="shrink-0 text-xs text-faint-foreground">{suffix}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-[13px] text-faint-foreground">{EM_DASH}</span>
      )}
    </div>
  );
}

function OptInChip({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium leading-none",
        enabled
          ? "bg-status-resolved-bg text-status-resolved-fg"
          : "bg-surface-hover text-muted-foreground",
      )}
    >
      {enabled ? <Check className="size-3" /> : <X className="size-3" />}
      {label} {enabled ? "opted in" : "opted out"}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}
