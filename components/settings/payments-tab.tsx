"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { formatDate } from "@/components/billing/format";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentsTabConfig, ReaderItem } from "./types";

/**
 * Settings → Payments.
 *
 * ONE SCREEN, THREE QUESTIONS, IN THIS ORDER:
 *
 *   1. Can this shop take a card at all?      (the connection)
 *   2. Which ways can a customer pay?         (online link, card on file, reader)
 *   3. What is still missing, and who fixes it? (env vars, webhook, readers)
 *
 * Almost none of it is editable. The Stripe account belongs to Stripe and the
 * keys belong to the server's environment; the only two buttons that change
 * anything are "Connect with Stripe" (which leaves for Stripe's own consent
 * screen) and "Register reader" (which pairs hardware the shop is holding).
 *
 * The distinction that gets its own warning is the one that looks identical
 * from the outside and is not: a missing STRIPE_SECRET_KEY means no pay button
 * anywhere, while a missing STRIPE_WEBHOOK_SECRET means customers CAN pay and
 * the invoice never updates. The second is the dangerous one.
 */

const CardIcon = ICONS.payment;
const ConnectIcon = ACTIONS.connect;
const DisconnectIcon = ACTIONS.disconnect;
const AddIcon = ACTIONS.add;

/** Reason codes the OAuth routes redirect back with. */
const FLASH: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: "Stripe account connected." },
  canceled: { ok: false, message: "Stripe connection cancelled — nothing changed." },
  denied: { ok: false, message: "Stripe declined the connection request." },
  "bad-state": {
    ok: false,
    message: "That Stripe link expired. Start the connection again.",
  },
  "no-code": { ok: false, message: "Stripe did not send an authorization code." },
  "exchange-failed": {
    ok: false,
    message: "Stripe would not complete the connection. Check the server log.",
  },
  forbidden: { ok: false, message: "Only the shop owner can connect Stripe." },
  unconfigured: {
    ok: false,
    message: "This server has no Stripe application configured.",
  },
  "already-connected": { ok: false, message: "This shop is already connected." },
};

export function PaymentsTab({
  config,
  disconnectAction,
  registerReaderAction,
}: {
  config: PaymentsTabConfig;
  disconnectAction: () => Promise<
    { ok: true; message: string } | { ok: false; error: string }
  >;
  registerReaderAction: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<{ ok: true; reader: ReaderItem } | { ok: false; error: string }>;
}) {
  useConnectFlash();

  if (!config.connectConfigured) {
    return <NotConfiguredCard env={config.env} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <ConnectionCard config={config} disconnectAction={disconnectAction} />
      <HowCustomersPayCard config={config} />
      <ReadersCard
        readers={config.readers}
        error={config.readersError}
        hasLocation={config.hasReaderLocation}
        registerReaderAction={registerReaderAction}
      />
      <ServerCard env={config.env} testMode={config.testMode} />
    </div>
  );
}

/**
 * Turns `?stripe=…` from the OAuth callback into a toast, then strips it so a
 * refresh does not repeat it. Same pattern as the customer hub's FlashToast.
 */
function useConnectFlash(): void {
  const router = useRouter();
  const params = useSearchParams();
  const fired = React.useRef(false);
  const code = params.get("stripe");

  React.useEffect(() => {
    if (fired.current || !code) return;
    const flash = FLASH[code];
    if (!flash) return;
    fired.current = true;
    if (flash.ok) toast.success(flash.message);
    else toast.error(flash.message);
    router.replace("/settings?tab=payments", { scroll: false });
  }, [code, router]);
}

// ---------------------------------------------------------------------------
// Not configured
// ---------------------------------------------------------------------------

function NotConfiguredCard({ env }: { env: PaymentsTabConfig["env"] }) {
  return (
    <Card>
      <CardHeader
        icon={CardIcon}
        title="Card payments"
        description="Not available on this server yet."
      />
      <CardContent className="flex flex-col gap-4">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Online payments aren&rsquo;t set up on this server yet — the
          RepairFlow admin needs to set <Env>STRIPE_SECRET_KEY</Env> and{" "}
          <Env>STRIPE_CLIENT_ID</Env>. Until then invoices show no pay button
          and the portal only displays the balance.
        </p>
        <VarList
          vars={[
            { name: "STRIPE_SECRET_KEY", set: env.vars.some((v) => v.name === "STRIPE_SECRET_KEY" && v.set) },
            ...env.vars.filter((v) => v.name !== "STRIPE_SECRET_KEY"),
          ]}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function ConnectionCard({
  config,
  disconnectAction,
}: {
  config: PaymentsTabConfig;
  disconnectAction: () => Promise<
    { ok: true; message: string } | { ok: false; error: string }
  >;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);

  const disconnect = () => {
    startTransition(async () => {
      const result = await disconnectAction();
      if (result.ok) {
        setConfirming(false);
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  };

  const account = config.account;
  const blocked = account !== null && !account.chargesEnabled;

  return (
    // Red stripe only when Stripe is refusing to charge: "not connected" is a
    // starting point, "connected but blocked" is a shop losing money today.
    <Card tone={blocked ? "danger" : undefined}>
      <CardHeader
        icon={CardIcon}
        title="Stripe account"
        description={
          config.connected
            ? "Card payments land in this shop's own Stripe account and pay out to its bank."
            : "Connect your Stripe account to take card payments. No API keys to copy — Stripe asks you to approve it and sends you straight back."
        }
        action={
          config.connected ? (
            // Disconnecting stops every card payment this shop can take, so it
            // reads destructive and asks first rather than firing on one click.
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              <DisconnectIcon aria-hidden />
              Disconnect
            </Button>
          ) : (
            // A plain anchor, not a Server Action: the next stop is Stripe's own
            // domain and a link is the honest way to say the browser is leaving.
            <Button asChild>
              <a href="/api/payments/stripe/connect">
                <ConnectIcon aria-hidden /> Connect with Stripe
              </a>
            </Button>
          )
        }
      />

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Two facts, one renderer: whether Stripe is attached at all, and
            whether the keys behind it move real money. Test mode is violet
            rather than green because "connected" and "actually charging
            people" are not the same thing and must not look the same.
          */}
          <StatusPill
            tone={config.connected ? "success" : "neutral"}
            label={config.connected ? "Connected" : "Not connected"}
          />
          <StatusPill
            tone={config.testMode ? "waiting" : "info"}
            label={config.testMode ? "Test mode" : "Live mode"}
          />
          <Chip>Currency: {config.currency.toUpperCase()}</Chip>
          {config.accountId ? (
            <Chip className="font-mono">{config.accountId}</Chip>
          ) : null}
          {/* The shared fixed-locale formatter, not toLocaleDateString: a
              locale-sensitive one renders differently on the server and in the
              browser, and React calls that a hydration mismatch. */}
          {config.onboardedAt ? (
            <Chip>Connected {formatDate(config.onboardedAt)}</Chip>
          ) : null}
        </div>

        {config.connected ? (
          config.accountError ? (
            <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
              Stripe could not be reached to check this account:{" "}
              {config.accountError}
            </p>
          ) : account ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Flag ok={account.chargesEnabled} label="Charges enabled" />
                <Flag ok={account.payoutsEnabled} label="Payouts enabled" />
                <Flag ok={account.detailsSubmitted} label="Details submitted" />
              </div>

              {blocked ? (
                <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
                  Stripe is not letting this account take payments yet
                  {account.disabledReason
                    ? ` (${account.disabledReason})`
                    : ""}
                  . Finish onboarding in the Stripe dashboard — every card
                  payment will be declined until you do.
                </p>
              ) : null}

              {account.defaultCurrency &&
              account.defaultCurrency !== config.currency ? (
                <p className="rounded-md bg-status-waiting-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-waiting-fg">
                  This shop charges in{" "}
                  <strong>{config.currency.toUpperCase()}</strong> but the
                  Stripe account&rsquo;s default is{" "}
                  <strong>{account.defaultCurrency.toUpperCase()}</strong>.
                  Stripe will convert, and the payout will not match the invoice
                  to the cent.
                </p>
              ) : null}
            </>
          ) : null
        ) : (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Without a connected account, payments run on this server&rsquo;s own
            Stripe account instead of the shop&rsquo;s. That works, but the
            money lands somewhere else.
          </p>
        )}
      </CardContent>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !pending) setConfirming(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect this Stripe account?</DialogTitle>
            <DialogDescription>
              Customers immediately lose the pay button on their invoices and in
              the portal, saved cards can no longer be charged, and any paired
              card reader stops taking payments. Payments already taken are
              unaffected and stay in Stripe. You can reconnect the same account
              later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={disconnect}>
              {pending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <DisconnectIcon aria-hidden />
              )}
              {pending ? "Disconnecting…" : "Disconnect Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-md bg-surface-hover px-3 py-2 text-[13.5px] font-semibold">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-status-resolved" />
      ) : (
        <CircleAlert className="size-4 shrink-0 text-status-in-progress" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// How customers can pay
// ---------------------------------------------------------------------------

function HowCustomersPayCard({ config }: { config: PaymentsTabConfig }) {
  const live = config.env.live && config.env.webhookReady;

  return (
    <Card>
      <CardHeader
        icon={ICONS.cash}
        title="How customers can pay"
        description="What is switched on right now, and where each one appears."
      />
      <CardContent className="flex flex-col gap-3">
        <Method
          icon={ICONS.payment}
          on={live}
          title="Online payment link"
          where="A pay button on emailed invoices and in the customer portal."
          off="Needs the Stripe key and webhook secret below."
        />
        <Method
          icon={ICONS.deposit}
          on={config.cardOnFileReady}
          title="Card on file"
          where="Save a card from a customer's page, then charge an invoice in one click."
          off="Needs online payments working first."
        />
        <Method
          icon={Smartphone}
          on={config.hasReaderLocation && config.env.live}
          title="Card reader at the counter"
          where="A 'Card reader' option on the POS tender screen and the invoice payment dialog."
          off="Register a reader below to switch this on."
        />
        <Method
          icon={ICONS.recurring}
          on={config.cardOnFileReady}
          title="Automatic recurring charges"
          where="Recurring schedules can charge the card on file the moment they raise an invoice."
          off="Needs a card on file, which needs online payments working."
        />
      </CardContent>
    </Card>
  );
}

function Method({
  icon: Icon,
  on,
  title,
  where,
  off,
}: {
  icon: React.ComponentType<{ className?: string }>;
  on: boolean;
  title: string;
  where: string;
  off: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-lg border px-4 py-3.5",
        on ? "border-border bg-surface" : "border-border bg-surface-hover",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          on ? "text-status-resolved" : "text-faint-foreground",
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-[14.5px] font-bold text-foreground">
          {title}
          {on ? null : (
            <StatusPill size="sm" dot={false} tone="neutral" label="Off" />
          )}
        </span>
        <span className="text-[13.5px] leading-relaxed text-muted-foreground">
          {on ? where : off}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function ReadersCard({
  readers,
  error,
  hasLocation,
  registerReaderAction,
}: {
  readers: ReaderItem[];
  error: string | null;
  hasLocation: boolean;
  registerReaderAction: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<{ ok: true; reader: ReaderItem } | { ok: false; error: string }>;
}) {
  return (
    <Card>
      <CardHeader
        icon={Smartphone}
        title="Card readers"
        description="Stripe Terminal readers paired with this shop."
        action={<RegisterReaderDialog action={registerReaderAction} />}
      />

      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            {error}
          </p>
        ) : readers.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="No readers paired"
            hint={
              hasLocation
                ? "Put a reader into pairing mode, read the three-word code off its screen, and register it here."
                : "Register your first one and RepairFlow will create the Stripe Terminal location from this shop's address automatically."
            }
            className="rounded-lg border border-dashed border-border py-10"
          />
        ) : (
          readers.map((reader) => (
            <div
              key={reader.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[14.5px] font-bold text-foreground">
                  {reader.label}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {reader.deviceType}
                  {reader.serialNumber ? ` · ${reader.serialNumber}` : ""}
                </span>
              </div>
              <StatusPill
                tone={reader.status === "online" ? "success" : "neutral"}
                label={reader.status === "online" ? "Online" : "Offline"}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RegisterReaderDialog({
  action,
}: {
  action: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<{ ok: true; reader: ReaderItem } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await action({ registrationCode: code, label });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.reader.label} is paired.`);
      setOpen(false);
      setCode("");
      setLabel("");
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <AddIcon aria-hidden /> Register reader
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register a card reader</DialogTitle>
          <DialogDescription>
            On the reader, open Settings and choose to generate a pairing code.
            Type the three words it shows.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="registrationCode">Registration code</Label>
            <Input
              id="registrationCode"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="quick-brown-fox"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="readerLabel">Name it</Label>
            <Input
              id="readerLabel"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Front counter"
              maxLength={60}
            />
            <p className="text-[13px] text-muted-foreground">
              Only staff ever see this.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !code.trim()}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" /> Pairing…
                </>
              ) : (
                <>
                  <AddIcon aria-hidden /> Register
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Server environment
// ---------------------------------------------------------------------------

function ServerCard({
  env,
  testMode,
}: {
  env: PaymentsTabConfig["env"];
  testMode: boolean;
}) {
  const takingMoneyBlind = env.live && !env.webhookReady;

  return (
    <Card>
      <CardHeader
        icon={ICONS.settings}
        title="Server setup"
        description="Set by whoever runs this RepairFlow server, not from this screen. Only whether each value is present is shown — never the value."
      />

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PAYMENTS_DRIVER
          </span>
          <code
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[13px] font-semibold",
              env.live
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground",
            )}
          >
            {env.driver}
          </code>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Keys
          </span>
          <code className="rounded-full bg-surface-hover px-3 py-1 font-mono text-[13px] font-semibold text-foreground">
            {testMode ? "test" : "live"}
          </code>
        </div>

        <VarList vars={env.vars} />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Webhook endpoint
          </span>
          <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
            {env.webhookUrl}
          </code>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Register this in the Stripe dashboard under Developers → Webhooks
            for <Env>checkout.session.completed</Env>,{" "}
            <Env>payment_intent.succeeded</Env>, <Env>charge.refunded</Env>,{" "}
            <Env>refund.updated</Env> and{" "}
            <Env>account.application.deauthorized</Env>, then paste the signing
            secret into <Env>STRIPE_WEBHOOK_SECRET</Env>. Add the same endpoint
            under <em>Connect</em> so events from connected accounts arrive too.
          </p>
        </div>

        {takingMoneyBlind ? (
          <p className="flex items-start gap-2.5 rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Customers can be charged, but <Env>STRIPE_WEBHOOK_SECRET</Env> is
              missing — every confirmation from Stripe is rejected, so paid
              invoices will stay outstanding. Set it before sending any invoice.
            </span>
          </p>
        ) : null}

        {env.live && !env.currencySupported ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            <Env>PAYMENTS_CURRENCY</Env> is set to{" "}
            <span className="font-mono">{env.currency}</span>, which is not a
            two-decimal currency. RepairFlow stores every amount in cents, so
            checkout is refused rather than risk charging the wrong amount.
          </p>
        ) : null}
      </CardContent>
    </Card>
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
            {variable.set
              ? "set"
              : variable.name === "PAYMENTS_CURRENCY"
                ? "not set — defaults to usd"
                : "not set"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
      {children}
    </code>
  );
}
