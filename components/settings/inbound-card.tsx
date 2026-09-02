"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveInboundEmailAction } from "@/app/(app)/settings/inbound-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/badge";
import type { InboundConfig } from "./types";

/**
 * Settings → Messaging → Inbound.
 *
 * The mirror image of the driver cards above it: those say how messages leave,
 * this says how replies come back. A customer answering an update email or
 * texting the shop's number lands on their ticket as a public comment, and the
 * ticket board grows a "Needs reply" pill until somebody answers.
 *
 * Like the rest of this tab, secrets are never rendered — only whether each one
 * is populated.
 */
const SaveIcon = ACTIONS.save;

export function InboundCard({ config }: { config: InboundConfig }) {
  const live = config.resendSecretSet || config.inboundTokenSet || config.twilioTokenSet;

  return (
    // Red stripe when no secret is set: both endpoints reject every request, so
    // customer replies are being dropped on the floor right now.
    <Card tone={live ? undefined : "danger"}>
      <CardHeader
        icon={ICONS.inbound}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Inbound email &amp; SMS
            <StatusPill
              size="sm"
              tone={live ? "success" : "danger"}
              label={live ? "Receiving" : "Rejecting everything"}
            />
          </span>
        }
        description={
          <>
            Replies from customers land on their ticket as a public update, and
            the ticket is flagged <strong>Needs reply</strong> until someone
            answers. A message from a number or address we don&rsquo;t know
            becomes a lead.
          </>
        }
      />

      <CardContent className="flex flex-col gap-6">
        <InboundAddress config={config} />

        <Section title="Webhook URLs">
          <UrlRow label="Email" url={config.emailUrl} />
          <UrlRow label="SMS" url={config.smsUrl} />
        </Section>

        <Section title="Email — Resend">
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            In Resend, add an inbound address on your domain and point it at the
            email URL above, then paste the signing secret it gives you into{" "}
            <Env>RESEND_WEBHOOK_SECRET</Env>. Set the address you chose in the
            field above so we know which shop a message is for. Anything
            forwarding mail through your own script can post the same JSON to{" "}
            <Env>?token=INBOUND_SECRET</Env> instead.
          </p>
          <VarList
            vars={[
              { name: "RESEND_WEBHOOK_SECRET", set: config.resendSecretSet },
              { name: "INBOUND_SECRET", set: config.inboundTokenSet },
            ]}
          />
          {!config.resendSecretSet && !config.inboundTokenSet ? (
            <Warning>
              Neither secret is set, so the email endpoint refuses every request.
              An inbound route that trusted anything would let a stranger write
              on a customer&rsquo;s ticket.
            </Warning>
          ) : null}
        </Section>

        <Section title="SMS — Twilio">
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            In the Twilio console, open your number, and under{" "}
            <em>A message comes in</em> set the webhook to the SMS URL above with
            method <strong>POST</strong>. Verification uses the same{" "}
            <Env>TWILIO_AUTH_TOKEN</Env> that sends messages, so there is nothing
            else to configure — but the URL in Twilio must match{" "}
            <Env>NEXT_PUBLIC_APP_URL</Env> exactly, because the signature covers
            it.
          </p>
          <VarList
            vars={[
              { name: "TWILIO_AUTH_TOKEN", set: config.twilioTokenSet },
              { name: "TWILIO_FROM", set: Boolean(config.twilioFrom) },
            ]}
          />
          {!config.twilioTokenSet ? (
            <Warning>
              <Env>TWILIO_AUTH_TOKEN</Env> is not set, so the SMS endpoint
              refuses every request rather than trusting an unsigned one.
            </Warning>
          ) : null}
        </Section>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function InboundAddress({ config }: { config: InboundConfig }) {
  const router = useRouter();
  const [value, setValue] = React.useState(config.inboundEmail);
  const [busy, setBusy] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveInboundEmailAction(value);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      value.trim() ? "Inbound address saved." : "Inbound address cleared.",
    );
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <Label htmlFor="inbound-email">This shop&rsquo;s inbound address</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="inbound-email"
          type="email"
          value={value}
          disabled={!config.canEdit || busy}
          onChange={(event) => setValue(event.target.value)}
          placeholder="replies@yourshop.com"
          className="max-w-sm"
        />
        {config.canEdit ? (
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <SaveIcon aria-hidden />}
            {busy ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {config.singleShop
          ? "Optional while this is the only shop on the server — anything that arrives is filed here. Set it before adding a second shop."
          : "Required: a message is filed against the shop whose address it was sent to."}
      </p>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-[13px] font-semibold text-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
        {url}
      </code>
    </div>
  );
}

function VarList({ vars }: { vars: { name: string; set: boolean }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
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
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
      {children}
    </p>
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
      {children}
    </code>
  );
}
