"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Mail,
  MessageSquare,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import type { MessagingConfig, PaymentsConfig } from "./types";

/**
 * Read-only view of how outbound email and SMS are wired up right now.
 *
 * Deliberately not editable: drivers are chosen by environment (see
 * lib/comms/config.ts), which is what keeps a staging box from blasting real
 * customers because someone flipped a switch in the UI. This screen exists so
 * "why didn't the customer get that?" has an answer that is one click away
 * instead of an SSH session.
 *
 * Values are read on the server and passed in — no secret ever reaches the
 * browser, only whether each variable is populated.
 */
export function MessagingTab({ config }: { config: MessagingConfig }) {
  return (
    <div className="flex flex-col gap-5">
      <DriverCard
        icon={Mail}
        title="Email"
        driver={config.emailDriver}
        live={config.emailDriver !== "log"}
        liveName="Resend"
        vars={config.emailVars}
        envKey="EMAIL_DRIVER"
        liveValue="resend"
      />

      <DriverCard
        icon={MessageSquare}
        title="SMS"
        driver={config.smsDriver}
        live={config.smsDriver !== "log"}
        liveName="Twilio"
        vars={config.smsVars}
        envKey="SMS_DRIVER"
        liveValue="twilio"
      />

      <PaymentsCard config={config.payments} />

      <Card>
        <CardHeader>
          <CardTitle>Customer links</CardTitle>
          <CardDescription>
            The origin every portal link in an outbound message is built from.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <code className="w-fit rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
            {config.appUrl}
          </code>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Set <Env>NEXT_PUBLIC_APP_URL</Env> to your real domain before going
            live, or customers will receive links pointing at localhost.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DriverCard({
  icon,
  title,
  driver,
  live,
  liveName,
  vars,
  envKey,
  liveValue,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  driver: string;
  live: boolean;
  liveName: string;
  vars: { name: string; set: boolean }[];
  envKey: string;
  liveValue: string;
}) {
  const missing = vars.filter((v) => !v.set);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3.5">
        <IconChip
          icon={icon}
          className={
            live
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {live
              ? `Sending through ${liveName}.`
              : "Log mode — messages are printed to the server console and filed in the outbox, but nothing leaves the building."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {envKey}
          </span>
          <code
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[13px] font-semibold",
              live
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground",
            )}
          >
            {driver}
          </code>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {live ? "Required variables" : `Needed to switch to ${liveName}`}
          </span>
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-center gap-2 text-[14px]">
              <CheckCircle2 className="size-4 shrink-0 text-faint-foreground" />
              <Env>{envKey}</Env>
              <span className="text-muted-foreground">
                = <span className="font-mono">{liveValue}</span>
              </span>
            </li>
            {vars.map((variable) => (
              <li key={variable.name} className="flex items-center gap-2 text-[14px]">
                {variable.set ? (
                  <CheckCircle2 className="size-4 shrink-0 text-status-resolved" />
                ) : (
                  <CircleAlert className="size-4 shrink-0 text-status-in-progress" />
                )}
                <Env>{variable.name}</Env>
                <span className="text-muted-foreground">
                  {variable.set ? "set" : "not set"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {live && missing.length > 0 ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            {title} is set to live but {missing.map((v) => v.name).join(" and ")}{" "}
            {missing.length === 1 ? "is" : "are"} missing — every send will be
            recorded in the outbox as failed.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Online card payments — status only, never a settings form.
 *
 * Two facts get their own line because they fail independently and look
 * identical from the outside:
 *
 *   STRIPE_SECRET_KEY      missing → no Pay button at all
 *   STRIPE_WEBHOOK_SECRET  missing → customers CAN pay, and the invoice never
 *                          updates, because the webhook that records the money
 *                          is rejected at the door
 *
 * The second is the dangerous one — money arrives and the shop's books say the
 * customer still owes it — so it is called out in its own warning rather than
 * folded into a list of variables.
 */
function PaymentsCard({ config }: { config: PaymentsConfig }) {
  const takingMoneyBlind = config.live && !config.webhookReady;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3.5">
        <IconChip
          icon={CreditCard}
          className={
            config.live
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex flex-col gap-1">
          <CardTitle>Online payments</CardTitle>
          <CardDescription>
            {config.live
              ? "Customers can pay an outstanding invoice by card from their portal. Card details are entered on Stripe's own page and never reach this server."
              : "Off — invoices show no pay button, and the portal only displays the balance."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PAYMENTS_DRIVER
          </span>
          <code
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[13px] font-semibold",
              config.live
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground",
            )}
          >
            {config.driver}
          </code>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Currency
          </span>
          <code className="rounded-full bg-surface-hover px-3 py-1 font-mono text-[13px] font-semibold text-foreground">
            {config.currency}
          </code>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {config.live ? "Required variables" : "Needed to switch on Stripe"}
          </span>
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-center gap-2 text-[14px]">
              <CheckCircle2 className="size-4 shrink-0 text-faint-foreground" />
              <Env>PAYMENTS_DRIVER</Env>
              <span className="text-muted-foreground">
                = <span className="font-mono">stripe</span> (assumed once the key
                is set)
              </span>
            </li>
            {config.vars.map((variable) => (
              <li key={variable.name} className="flex items-center gap-2 text-[14px]">
                {variable.set ? (
                  <CheckCircle2 className="size-4 shrink-0 text-status-resolved" />
                ) : (
                  <CircleAlert className="size-4 shrink-0 text-status-in-progress" />
                )}
                <Env>{variable.name}</Env>
                <span className="text-muted-foreground">
                  {variable.set
                    ? "set"
                    : variable.name === "PAYMENTS_CURRENCY"
                      ? "not set — defaults to usd"
                      : "not set"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Webhook endpoint
          </span>
          <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
            {config.webhookUrl}
          </code>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Add this in the Stripe dashboard under Developers → Webhooks,
            subscribed to <Env>checkout.session.completed</Env>, and paste the
            signing secret it gives you into{" "}
            <Env>STRIPE_WEBHOOK_SECRET</Env>. Locally, run{" "}
            <Env>
              stripe listen --forward-to localhost:3020/api/webhooks/stripe
            </Env>{" "}
            and use the <Env>whsec_…</Env> it prints.
          </p>
        </div>

        {takingMoneyBlind ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            Customers can be charged, but <Env>STRIPE_WEBHOOK_SECRET</Env> is
            missing — every confirmation from Stripe is rejected, so paid
            invoices will stay outstanding. Set it before sending any invoice.
          </p>
        ) : null}

        {config.live && !config.currencySupported ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            <Env>PAYMENTS_CURRENCY</Env> is set to{" "}
            <span className="font-mono">{config.currency}</span>, which is not a
            two-decimal currency. RepairFlow stores every amount in cents, so
            checkout is refused rather than risk charging the wrong amount.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
      {children}
    </code>
  );
}
