"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ICONS } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { attentionBorder } from "./card-attention";
import { InboundAddress, InboundTechnical, inboundLive } from "./inbound-card";
import { StatusTile } from "./status-tile";
import { TechnicalDetails } from "./technical-details";
import type { MessagingConfig } from "./types";

/**
 * Settings → Emails & texts.
 *
 * The owner's question is "are my customers getting my emails and texts?", so
 * that is what the top of the screen answers: one tile each for emails, texts
 * and replies, a status word, what it means, and the next step. How messages
 * are wired (the provider, the variables, the web addresses) is for whoever
 * installed Repairs helper and sits under Technical details.
 *
 * Deliberately not editable: providers are chosen by environment (see
 * lib/comms/config.ts), which is what keeps a staging box from messaging real
 * customers because someone flipped a switch in the UI.
 *
 * Values are read on the server and passed in — no secret ever reaches the
 * browser, only whether each variable is populated.
 */
export function MessagingTab({ config }: { config: MessagingConfig }) {
  const emailLive = config.emailDriver !== "log";
  const smsLive = config.smsDriver !== "log";
  const repliesLive = inboundLive(config.inbound);
  const owner = config.inbound.canEdit;
  const askWho = owner ? "your installer" : "your shop owner";

  return (
    <div className="flex flex-col gap-4">
      <StatusTile
        photo="/images/home/megaphone.webp"
        title="Emails to customers"
        state={emailLive ? "Sending" : "Not sending yet"}
        tone={emailLive ? "success" : "neutral"}
        detail={
          emailLive
            ? "Repair updates, estimates, invoices and receipts are emailed to customers under your shop's name."
            : `Emails are kept in the outbox and not sent to customers yet. Ask ${askWho} to connect an email service.`
        }
      />

      <StatusTile
        photo="/images/products/phone.webp"
        title="Text messages"
        state={smsLive ? "Sending" : "Not sending yet"}
        tone={smsLive ? "success" : "neutral"}
        detail={
          smsLive
            ? "Customers who said yes to texts get their updates by text message."
            : `Texts are kept in the outbox and not sent yet. Ask ${askWho} to connect a text message service.`
        }
      />

      <StatusTile
        icon={ICONS.inbound}
        title="Customer replies"
        state={repliesLive ? "Coming in" : "Not set up yet"}
        tone={repliesLive ? "success" : "neutral"}
        detail={
          repliesLive
            ? "When a customer answers an email or a text, it lands on their repair and the repair shows Needs reply."
            : `Replies to your emails and texts do not come back into Repairs helper yet. Ask ${askWho} to switch replies on.`
        }
      >
        {owner ? <div className="w-full"><InboundAddress config={config.inbound} /></div> : null}
      </StatusTile>

      <TechnicalDetails>
        <DriverCard
          icon={ICONS.email}
          title="Email"
          driver={config.emailDriver}
          live={emailLive}
          liveName="Resend"
          vars={config.emailVars}
          envKey="EMAIL_DRIVER"
          liveValue="resend"
        />

        <DriverCard
          icon={ICONS.message}
          title="SMS"
          driver={config.smsDriver}
          live={smsLive}
          liveName="Twilio"
          vars={config.smsVars}
          envKey="SMS_DRIVER"
          liveValue="twilio"
        />

        <InboundTechnical config={config.inbound} />

        <Card>
          <CardHeader
            icon={ICONS.customer}
            title="Customer links"
            description="The origin every portal link in an outbound message is built from."
          />
          <CardContent className="flex flex-col gap-2">
            <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[14px] text-foreground">
              {config.appUrl}
            </code>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Set <Env>NEXT_PUBLIC_APP_URL</Env> to your real domain before going
              live, or customers will receive links pointing at localhost.
            </p>
          </CardContent>
        </Card>
      </TechnicalDetails>
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
    // Log mode earns the amber border: nothing this shop "sends" is leaving the
    // building, and that is the single most surprising thing on the screen.
    <Card className={live ? undefined : attentionBorder("active")}>
      <CardHeader
        icon={icon}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {title}
            <StatusPill
              size="sm"
              tone={live ? "success" : "active"}
              label={live ? `Live · ${liveName}` : "Log mode"}
            />
          </span>
        }
        description={
          live
            ? `Sending through ${liveName}.`
            : "Log mode: messages are printed to the server console and filed in the outbox; nothing is delivered."
        }
      />

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {envKey}
          </span>
          <code
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[14px] font-semibold",
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
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[14px] font-medium leading-relaxed text-status-overdue-fg">
            {title} is set to live but {missing.map((v) => v.name).join(" and ")}{" "}
            {missing.length === 1 ? "is" : "are"} missing — every send will be
            recorded in the outbox as failed.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[14px] font-semibold text-foreground">
      {children}
    </code>
  );
}
