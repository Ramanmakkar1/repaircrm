"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BatteryMedium,
  CheckCircle2,
  CircleAlert,
  Loader2,
  MinusCircle,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { formatDate, formatDateTime } from "@/components/billing/format";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import {
  PAYMENT_PROVIDERS,
  TARGET_COUNTRIES,
  providersForCountry,
  type PaymentProviderDefinition,
  type TargetCountry,
} from "@/lib/payments/providers";
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
import { DeviceAccessCard } from "@/components/settings/device-access-card";
import type { CheckLine, PaymentsHealth } from "@/lib/payments";
import type {
  PaymentsTabConfig,
  PayoutState,
  ReaderItem,
  SquareTerminalDevice,
} from "./types";

/**
 * Settings → Payments.
 *
 * ONE SCREEN, FIVE QUESTIONS, IN THIS ORDER:
 *
 *   1. Which providers work for this shop's country?
 *   2. Is Stripe connected and ready to take a card?
 *   3. Where does the money go, and when?
 *   4. Which ways can a customer pay? (link, card on file, machine)
 *   5. Is anything broken, and what do I press? (the card machines, the check)
 *
 * THE WORDS
 * ---------
 * A shop owner reads this screen. So: "card machine", not "Terminal reader".
 * "Payment confirmations", not "webhooks". "Practice machine", not "simulated
 * reader". Nothing that only makes sense if you have read Stripe's docs
 * appears outside the one collapsed "Set it up by hand" block, which exists
 * for the rare deployment where the automatic setup cannot run and is
 * addressed to whoever runs the server, not to the shop.
 *
 * WHAT IS EDITABLE
 * ----------------
 * Connect, disconnect, add a card machine, rename it, remove it, retry the
 * automatic setup, and run the self-check. Everything else is a fact reported
 * from Stripe or from the server's environment, and a form that pretended
 * otherwise would be a form that lies.
 */

const CardIcon = ICONS.payment;
const ConnectIcon = ACTIONS.connect;
const DisconnectIcon = ACTIONS.disconnect;
const AddIcon = ACTIONS.add;
const ReaderIcon = ICONS.cardMachine;
const PayoutIcon = ICONS.payout;
const EditIcon = ACTIONS.edit;
const ForgetIcon = ACTIONS.delete;
const RetryIcon = ACTIONS.retry;
const OpenIcon = ACTIONS.openExternal;

/** Reason codes the OAuth routes redirect back with. */
const FLASH: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: "Stripe account connected — you're ready to take cards." },
  "connected-setup-failed": {
    ok: false,
    message:
      "Connected, but the automatic setup didn't finish. Press Retry setup below.",
  },
  "connected-not-public": {
    ok: false,
    message:
      "Connected. Stripe can't reach this app on its current address, so payments will settle later.",
  },
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

const SQUARE_FLASH: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: "Square account connected." },
  canceled: { ok: false, message: "Square connection cancelled — nothing changed." },
  denied: { ok: false, message: "Square declined the connection request." },
  "bad-state": { ok: false, message: "That Square link expired. Start the connection again." },
  "no-code": { ok: false, message: "Square did not send an authorization code." },
  "exchange-failed": { ok: false, message: "Square could not complete the connection. Check the server log." },
  forbidden: { ok: false, message: "Only the shop owner can connect Square." },
  unconfigured: { ok: false, message: "This server has no Square application configured." },
  "already-connected": { ok: false, message: "This shop is already connected to Square." },
};

export type SimpleResult = { ok: true; message: string } | { ok: false; error: string };
export type ReaderResult = { ok: true; reader: ReaderItem } | { ok: false; error: string };
type SquarePairingResult =
  | { ok: true; code: string; deviceId: string; pairBy: string | null }
  | { ok: false; error: string };

export function PaymentsTab({
  config,
  disconnectAction,
  disconnectSquareAction,
  createSquareDeviceCodeAction,
  registerReaderAction,
  pairPracticeReaderAction,
  renameReaderAction,
  forgetReaderAction,
  retrySetupAction,
  testPaymentsAction,
}: {
  config: PaymentsTabConfig;
  disconnectAction: () => Promise<SimpleResult>;
  disconnectSquareAction: () => Promise<SimpleResult>;
  createSquareDeviceCodeAction: (input: { name: string }) => Promise<SquarePairingResult>;
  registerReaderAction: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<ReaderResult>;
  pairPracticeReaderAction: (input: { label: string }) => Promise<ReaderResult>;
  renameReaderAction: (input: {
    readerId: string;
    label: string;
  }) => Promise<ReaderResult>;
  forgetReaderAction: (input: { readerId: string }) => Promise<SimpleResult>;
  retrySetupAction: () => Promise<SimpleResult>;
  testPaymentsAction: () => Promise<
    { ok: true; health: PaymentsHealth } | { ok: false; error: string }
  >;
}) {
  useConnectFlash();
  const shopCountry = targetCountry(config.country);
  const squareAccountCountry = config.square.country
    ? targetCountry(config.square.country)
    : null;
  const squareProvider = PAYMENT_PROVIDERS.find((provider) => provider.id === "square");
  const squareMarketSupported = Boolean(
    shopCountry &&
      shopCountry !== "NZ" &&
      squareProvider?.countries.includes(shopCountry) &&
      (!squareAccountCountry || squareAccountCountry === shopCountry),
  );

  return (
    <div className="flex flex-col gap-5">
      <ProviderCatalogCard
        config={config}
        disconnectSquareAction={disconnectSquareAction}
      />
      {config.square.connected && squareMarketSupported ? (
        <SquareTerminalCard
          devices={config.square.devices}
          canPair={config.square.configured && !config.square.hasError}
          hasError={config.square.hasError}
          webhookReady={config.square.webhookReady}
          action={createSquareDeviceCodeAction}
        />
      ) : null}
      {!config.connectConfigured ? (
        <NotConfiguredCard env={config.env} />
      ) : (
        <>
          <ConnectionCard config={config} disconnectAction={disconnectAction} />
          <GettingPaidCard config={config} retrySetupAction={retrySetupAction} />
          <HowCustomersPayCard config={config} />
          <CardMachinesCard
            config={config}
            registerReaderAction={registerReaderAction}
            pairPracticeReaderAction={pairPracticeReaderAction}
            renameReaderAction={renameReaderAction}
            forgetReaderAction={forgetReaderAction}
          />
          <HealthCard testPaymentsAction={testPaymentsAction} />
          <ServerCard config={config} />
        </>
      )}
      <DeviceAccessCard />
    </div>
  );
}

const COUNTRY_NAMES: Record<TargetCountry, string> = {
  NZ: "New Zealand",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
};

function targetCountry(country: string): TargetCountry | null {
  const value = country.trim().toUpperCase();
  const aliases: Record<string, TargetCountry> = {
    "NEW ZEALAND": "NZ",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    CANADA: "CA",
    "UNITED KINGDOM": "GB",
    UK: "GB",
  };
  const normalized = aliases[value] ?? value;
  return TARGET_COUNTRIES.includes(normalized as TargetCountry)
    ? (normalized as TargetCountry)
    : null;
}

function ProviderCatalogCard({
  config,
  disconnectSquareAction,
}: {
  config: PaymentsTabConfig;
  disconnectSquareAction: () => Promise<SimpleResult>;
}) {
  const country = targetCountry(config.country);
  const providers = country
    ? providersForCountry(country)
    : PAYMENT_PROVIDERS.filter((provider) =>
        ["stripe", "square"].includes(provider.id),
      );
  const square = PAYMENT_PROVIDERS.find((provider) => provider.id === "square");
  const visibleProviders = square && !providers.some((item) => item.id === "square")
    ? [...providers, square]
    : providers;

  return (
    <Card>
      <CardHeader
        icon={CardIcon}
        title="Payment providers"
        description="See what works in your shop’s country and connect a supported account."
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Payment region and currency">
          <Chip>
            Shop country: {country
              ? `${COUNTRY_NAMES[country]} (${country})`
              : config.country.trim() || "Not set"}
          </Chip>
          <Chip>Charge currency: {config.currency.toUpperCase()}</Chip>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {visibleProviders.map((provider) => (
            <ProviderOption
              key={provider.id}
              provider={provider}
              config={config}
              country={country}
              disconnectSquareAction={disconnectSquareAction}
            />
          ))}
        </div>

        <details className="rounded-lg border border-border bg-surface-hover px-4 py-3">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            Manual and API-key gateways
          </summary>
          <div className="flex flex-col gap-2 pt-3">
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Some processors use API credentials instead of an account approval. RepairPilot does not accept payment secrets in this browser. A key alone cannot turn on a provider; its secure server-side connector must be available first.
            </p>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {visibleProviders.some((provider) => provider.connectionMode === "api_credentials")
                ? `For ${visibleProviders.filter((provider) => provider.connectionMode === "api_credentials").map((provider) => provider.name).join(", ")}, setup is not available in RepairPilot yet.`
                : "No API-key payment gateway is enabled for this shop yet."}
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function ProviderOption({
  provider,
  config,
  country,
  disconnectSquareAction,
}: {
  provider: PaymentProviderDefinition;
  config: PaymentsTabConfig;
  country: TargetCountry | null;
  disconnectSquareAction: () => Promise<SimpleResult>;
}) {
  const squareAccountCountry = config.square.country
    ? targetCountry(config.square.country)
    : null;
  const squareSupported = Boolean(country && provider.countries.includes(country));
  const squareUnavailableInNZ =
    provider.id === "square" && (country === "NZ" || squareAccountCountry === "NZ");
  const linked = provider.id === "stripe"
    ? config.connected
    : provider.id === "square"
      ? config.square.connected
      : false;
  const squareCountryMismatch =
    provider.id === "square" &&
    linked &&
    Boolean(country && squareAccountCountry && country !== squareAccountCountry);
  const connectionConfigured = provider.id === "stripe"
    ? config.connectConfigured
    : provider.id === "square"
      ? config.square.configured
      : false;

  let status = "Not available in RepairPilot";
  let tone: "success" | "neutral" | "waiting" | "info" = "neutral";
  let detail = provider.description;

  if (provider.id === "stripe") {
    if (linked) {
      status = "Connected";
      tone = "success";
      detail = "Online card payments and Stripe Terminal are connected for this shop.";
    } else if (connectionConfigured) {
      status = "Ready to connect";
      tone = "info";
      detail = "Connect your Stripe account with a secure approval. No payment keys are copied into RepairPilot.";
    } else {
      status = "Server setup needed";
      tone = "waiting";
      detail = "A RepairPilot admin must configure Stripe on the server before shops can connect.";
    }
  } else if (provider.id === "square") {
    if (linked) {
      status = squareUnavailableInNZ
        ? "Linked · unavailable in NZ"
        : squareCountryMismatch
          ? "Country mismatch"
        : !config.square.configured
          ? "Server setup needed"
          : config.square.hasError
            ? "Connection needs attention"
            : !config.square.webhookReady
              ? "Webhook setup needed"
              : "Connected";
      tone = squareUnavailableInNZ ||
        squareCountryMismatch ||
        !config.square.configured ||
        config.square.hasError ||
        !config.square.webhookReady
        ? "waiting"
        : "success";
      detail = squareUnavailableInNZ
        ? squareAccountCountry === "NZ" && country !== "NZ"
          ? "This Square account is registered in New Zealand, where RepairPilot cannot process Square payments. Connect an account in the shop’s country."
          : "Square payment processing is not available for New Zealand shops. Stripe remains available here."
        : squareCountryMismatch
          ? `The Square account is registered in ${squareAccountCountry ? COUNTRY_NAMES[squareAccountCountry] : "a different country"}, but this shop is set to ${country ? COUNTRY_NAMES[country] : "another country"}. Confirm the shop country and connect the matching Square account.`
        : !config.square.configured
          ? "The Square account is linked, but this server no longer has the Square application credentials it needs."
        : config.square.hasError
          ? "Square is linked, but RepairPilot could not refresh its account details. Disconnect and reconnect if this continues."
          : !config.square.webhookReady
            ? "Square is linked, but payment confirmations are not ready. Ask the server admin to set SQUARE_WEBHOOK_SIGNATURE_KEY before taking payments."
          : `Connected to ${config.square.merchantName || "your Square account"}${config.square.locationName ? ` · ${config.square.locationName}` : ""}.`;
    } else if (squareUnavailableInNZ) {
      status = "Unavailable in New Zealand";
      tone = "neutral";
      detail = "Square payment processing is not available for New Zealand shops. Stripe is available here.";
    } else if (!country && !config.country.trim()) {
      status = "Set shop country first";
      tone = "waiting";
      detail = "Square is available for shops in the United States, Canada and United Kingdom.";
    } else if (!squareSupported) {
      status = country
        ? `Unavailable in ${COUNTRY_NAMES[country]}`
        : "Unsupported market";
      tone = "neutral";
      detail = "Square is available for shops in the United States, Canada and United Kingdom.";
    } else if (connectionConfigured && config.square.hasError) {
      status = "Reconnect needed";
      tone = "waiting";
      detail = "RepairPilot could not refresh the previous Square connection. Reconnect to restore access.";
    } else if (connectionConfigured) {
      status = "Ready to connect";
      tone = "info";
      detail = "Approve Square access and return here. Credentials stay on the RepairPilot server.";
    } else {
      status = "Server setup needed";
      tone = "waiting";
      detail = "A RepairPilot admin must set SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET on the server.";
    }
  } else if (!provider.availableNow) {
    status = provider.connectionMode === "api_credentials"
      ? "API setup planned"
      : provider.connectionMode === "partner_approval"
        ? "Partner setup planned"
        : "Not available yet";
    tone = "neutral";
  }

  const canConnectSquare =
    provider.id === "square" &&
    Boolean(country) &&
    squareSupported &&
    !linked &&
    connectionConfigured;

  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14.5px] font-bold text-foreground">{provider.name}</span>
            <StatusPill size="sm" dot={false} tone={tone} label={status} />
          </div>
          <span className="shrink-0 text-[11.5px] font-semibold text-muted-foreground">
            {connectionModeLabel(provider.connectionMode)}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>

      {provider.id === "stripe" && !linked && connectionConfigured ? (
        <Button asChild size="sm" className="w-fit">
          <a href="/api/payments/stripe/connect">
            <ConnectIcon aria-hidden /> Connect with Stripe
          </a>
        </Button>
      ) : null}
      {canConnectSquare ? (
        <Button asChild size="sm" className="w-fit">
          <a href="/api/payments/square/connect">
            <ConnectIcon aria-hidden />
            {config.square.hasError ? "Reconnect Square" : "Connect with Square"}
          </a>
        </Button>
      ) : null}
      {provider.id === "square" && linked ? (
        <SquareDisconnectButton action={disconnectSquareAction} />
      ) : null}
    </div>
  );
}

function SquareTerminalCard({
  devices,
  canPair,
  hasError,
  webhookReady,
  action,
}: {
  devices: SquareTerminalDevice[];
  canPair: boolean;
  hasError: boolean;
  webhookReady: boolean;
  action: (input: { name: string }) => Promise<SquarePairingResult>;
}) {
  return (
    <Card>
      <CardHeader
        icon={ReaderIcon}
        title="Square Terminal"
        description="Square countertop devices paired with this shop."
        action={<SquareTerminalPairingDialog action={action} disabled={!canPair} />}
      />
      <CardContent className="flex flex-col gap-3">
        {!canPair ? (
          <p role="status" className="rounded-md bg-status-waiting-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-waiting-fg">
            {hasError
              ? "Square needs attention before another Terminal can be paired. Reconnect the Square account above."
              : "Square’s server credentials are missing, so RepairPilot cannot pair another Terminal right now."}
          </p>
        ) : null}
        {!webhookReady ? (
          <p role="status" className="rounded-md bg-status-waiting-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-waiting-fg">
            Terminal pairing does not need a webhook, but payment confirmations are not ready. Ask the server admin to set <Env>SQUARE_WEBHOOK_SIGNATURE_KEY</Env> before taking Square payments in RepairPilot.
          </p>
        ) : null}
        {devices.length === 0 ? (
          <EmptyState
            icon={ReaderIcon}
            title="No Square Terminal paired"
            hint="Generate a pairing code, then enter it on the Square Terminal before the code expires."
            className="rounded-lg border border-dashed border-border py-9"
          />
        ) : (
          devices.map((device) => (
            <SquareTerminalRow key={device.id} device={device} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SquareTerminalRow({ device }: { device: SquareTerminalDevice }) {
  const raw = device.status.toUpperCase();
  const online = raw === "ONLINE" || raw === "READY" || raw === "ACTIVE";
  const tone: "success" | "neutral" | "waiting" = online
    ? "success"
    : raw === "OFFLINE"
      ? "neutral"
      : "waiting";
  const label = online
    ? "Online"
    : raw === "OFFLINE"
      ? "Offline"
      : raw === "PAIRED"
        ? "Paired"
        : raw === "UNPAIRED"
          ? "Not paired"
          : "Status unavailable";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[14.5px] font-bold text-foreground">{device.name}</span>
        <span className="text-[13px] text-muted-foreground">Square Terminal</span>
      </div>
      <StatusPill tone={tone} label={label} />
    </div>
  );
}

function SquareTerminalPairingDialog({
  action,
  disabled,
}: {
  action: (input: { name: string }) => Promise<SquarePairingResult>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("Front counter");
  const [pairing, setPairing] = React.useState<{
    code: string;
    pairBy: string | null;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  function createCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await action({ name: name.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPairing({ code: result.code, pairBy: result.pairBy });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setPairing(null);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <ConnectIcon aria-hidden /> Pair a Square Terminal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pairing ? "Enter this code on the Terminal" : "Pair a Square Terminal"}</DialogTitle>
          <DialogDescription>
            {pairing
              ? "On the Square Terminal, enter the code below when it asks to pair with a device."
              : "Give the device a name, then generate a code to pair it to this shop’s Square account."}
          </DialogDescription>
        </DialogHeader>

        {pairing ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-hover px-4 py-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pairing code
            </span>
            <code
              aria-live="polite"
              className="rounded-md bg-surface px-4 py-2 font-mono text-3xl font-bold tracking-[0.24em] text-foreground"
            >
              {pairing.code}
            </code>
            {pairing.pairBy ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Enter it by {formatDateTime(pairing.pairBy)} UTC.
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Square did not return an expiry time. Enter the code now.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={createCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="square-terminal-name">Terminal name</Label>
              <Input
                id="square-terminal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Front counter"
                maxLength={60}
                required
              />
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
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <ConnectIcon aria-hidden />}
                {pending ? "Generating code…" : "Generate pairing code"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {pairing ? (
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SquareDisconnectButton({
  action,
}: {
  action: () => Promise<SimpleResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function disconnect() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-fit text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <DisconnectIcon aria-hidden /> Disconnect Square
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect this Square account?</DialogTitle>
          <DialogDescription>
            RepairPilot will revoke its Square access. Sales already recorded in Square are unaffected, and you can reconnect later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={disconnect}>
            {pending ? <Loader2 className="animate-spin" /> : <DisconnectIcon aria-hidden />}
            {pending ? "Disconnecting…" : "Disconnect Square"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function connectionModeLabel(mode: PaymentProviderDefinition["connectionMode"]): string {
  if (mode === "oauth") return "Secure account connection";
  if (mode === "api_credentials") return "API-key setup";
  return "Provider approval";
}

/**
 * Turns `?stripe=…` from the OAuth callback into a toast, then strips it so a
 * refresh does not repeat it. Same pattern as the customer hub's FlashToast.
 */
function useConnectFlash(): void {
  const router = useRouter();
  const params = useSearchParams();
  const fired = React.useRef(false);
  const stripeCode = params.get("stripe");
  const squareCode = params.get("square");

  React.useEffect(() => {
    if (fired.current || (!stripeCode && !squareCode)) return;
    const flash = stripeCode
      ? FLASH[stripeCode]
      : squareCode
        ? SQUARE_FLASH[squareCode]
        : undefined;
    if (!flash) return;
    fired.current = true;
    if (flash.ok) toast.success(flash.message);
    else toast.error(flash.message);
    router.replace("/settings?tab=payments", { scroll: false });
  }, [router, squareCode, stripeCode]);
}

// ---------------------------------------------------------------------------
// Not configured
// ---------------------------------------------------------------------------

function NotConfiguredCard({ env }: { env: PaymentsTabConfig["env"] }) {
  return (
    <Card>
      <CardHeader
        icon={CardIcon}
        title="Stripe processing"
        description="Stripe is not configured on this server yet."
      />
      <CardContent className="flex flex-col gap-4">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Stripe online payments aren&rsquo;t set up on this server yet — the
          RepairPilot admin needs to set <Env>STRIPE_SECRET_KEY</Env> and{" "}
          <Env>STRIPE_CLIENT_ID</Env>. Until then invoices show no pay button
          and the portal only displays the balance.
        </p>
        <VarList
          vars={[
            {
              name: "STRIPE_SECRET_KEY",
              set: env.vars.some((v) => v.name === "STRIPE_SECRET_KEY" && v.set),
            },
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
  disconnectAction: () => Promise<SimpleResult>;
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
            : "Connect Stripe from the provider list above. No API keys to copy — Stripe asks you to approve it and sends you straight back."
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
          ) : null
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
            label={config.testMode ? "Practice mode" : "Live mode"}
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
                <Flag ok={account.chargesEnabled} label="Can take cards" />
                <Flag ok={account.payoutsEnabled} label="Can pay you out" />
                <Flag ok={account.detailsSubmitted} label="Stripe has your details" />
              </div>

              {blocked ? (
                <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
                  Stripe is not letting this account take payments yet
                  {account.disabledReason ? ` (${account.disabledReason})` : ""}.
                  Sign in to Stripe and finish the questions they ask — every
                  card will be declined until you do.
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
              card machine stops taking payments. Payments already taken are
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
// How you get paid
// ---------------------------------------------------------------------------

/** A fixed locale, for the same hydration reason as formatDate. */
function money(amountCents: number, currency: string): string {
  const value = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function totalOf(buckets: PayoutState["available"]): string | null {
  if (buckets.length === 0) return null;
  return buckets
    .map((bucket) => money(bucket.amountCents, bucket.currency))
    .join(" + ");
}

/**
 * The panel that answers the only question the owner actually asked.
 *
 * It carries the automatic-setup state too, rather than putting that in its own
 * card, because "Stripe knows how to confirm your payments" is not a separate
 * subject from "how you get paid" — it is the reason a paid invoice says paid.
 */
function GettingPaidCard({
  config,
  retrySetupAction,
}: {
  config: PaymentsTabConfig;
  retrySetupAction: () => Promise<SimpleResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const { payout, setup, address } = config;

  const retry = () => {
    startTransition(async () => {
      const result = await retrySetupAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      router.refresh();
    });
  };

  const available = totalOf(payout.available);
  const pendingMoney = totalOf(payout.pending);
  // Offered whenever it could do something, not only when something is
  // visibly broken: Stripe's own dashboard is where an endpoint gets deleted
  // by accident, and the shop finds out from "Test payments" — which tells
  // them to press this. A button that is missing exactly when its instruction
  // is on screen is worse than one that is occasionally redundant, and the
  // action is idempotent either way.
  const canRetry = config.connected && address.publicAddress;

  return (
    <Card>
      <CardHeader
        icon={PayoutIcon}
        title="How you get paid"
        description="Where card payments end up, and roughly when."
        action={
          <Button variant="outline" asChild>
            <a href={payout.dashboardUrl} target="_blank" rel="noreferrer">
              <OpenIcon aria-hidden /> Open Stripe
            </a>
          </Button>
        }
      />

      <CardContent className="flex flex-col gap-4">
        <p className="text-[14px] leading-relaxed text-foreground">
          {payout.scheduleText}
        </p>

        {payout.bankText ? (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Paid into {payout.bankText}.
          </p>
        ) : config.connected && !payout.error ? (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            No bank account is attached to this Stripe account yet, so the money
            stays at Stripe until you add one.
          </p>
        ) : null}

        {available || pendingMoney ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Amount label="On its way to your bank" value={available ?? "—"} />
            <Amount label="Taken, still clearing" value={pendingMoney ?? "—"} />
          </div>
        ) : null}

        {payout.error ? (
          <p className="rounded-md bg-status-waiting-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-waiting-fg">
            {payout.error}
          </p>
        ) : null}

        <Separator />

        {!address.publicAddress ? (
          <SetupRow
            tone="warn"
            title="Stripe can't reach this app yet"
            body={address.message}
          />
        ) : !config.connected ? (
          <SetupRow
            tone="muted"
            title="Nothing to set up yet"
            body="Connect your Stripe account above and RepairPilot will set up the rest for you — there is no second step."
          />
        ) : setup.automatic ? (
          <SetupRow
            tone="ok"
            title="Payments confirm themselves"
            body={`RepairPilot set this up for you${
              setup.setUpAt ? ` on ${formatDate(setup.setUpAt)}` : ""
            }. When a card is charged, Stripe tells this app and the invoice marks itself paid.`}
          />
        ) : (
          <SetupRow
            tone="bad"
            title="Automatic setup didn't finish"
            body={
              setup.error ??
              "Stripe hasn't been told where to confirm your payments, so a paid invoice may stay marked unpaid."
            }
          />
        )}

        {setup.addressChanged ? (
          <p className="rounded-md bg-status-waiting-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-waiting-fg">
            This app has moved since it was set up — Stripe is still confirming
            payments to <span className="font-mono">{setup.url}</span>. Press
            Retry setup to point it at the new address.
          </p>
        ) : null}

        {canRetry ? (
          <div>
            <Button variant="outline" disabled={pending} onClick={retry}>
              {pending ? <Loader2 className="animate-spin" /> : <RetryIcon aria-hidden />}
              Retry setup
            </Button>
          </div>
        ) : null}

        <ManualFallback config={config} />
      </CardContent>
    </Card>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-hover px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-[19px] font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
    </div>
  );
}

function Separator() {
  return <div className="h-px w-full bg-border" />;
}

function SetupRow({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warn" | "bad" | "muted";
  title: string;
  body: string;
}) {
  const Icon =
    tone === "ok" ? CheckCircle2 : tone === "muted" ? MinusCircle : TriangleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3.5",
        tone === "ok" && "border-border bg-surface",
        tone === "warn" && "border-border bg-status-waiting-bg",
        tone === "bad" && "border-destructive/40 bg-destructive-soft",
        tone === "muted" && "border-border bg-surface-hover",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "ok" && "text-status-resolved",
          tone === "warn" && "text-status-waiting-fg",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-faint-foreground",
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[14.5px] font-bold text-foreground">{title}</span>
        <span className="text-[13.5px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </div>
    </div>
  );
}

/**
 * The escape hatch, collapsed.
 *
 * Some platforms cannot create an endpoint on a connected account, and some
 * deployments sit behind something that will not pass a POST. This is the only
 * place on the screen where Stripe's own vocabulary is allowed, and it is
 * addressed to whoever runs the server rather than to the shop.
 */
function ManualFallback({ config }: { config: PaymentsTabConfig }) {
  return (
    <details className="rounded-lg border border-border bg-surface-hover px-4 py-3">
      <summary className="cursor-pointer text-[13.5px] font-semibold text-foreground">
        Set it up by hand (for whoever runs this server)
      </summary>
      <div className="flex flex-col gap-2 pt-3">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          In the Stripe dashboard, under Developers → Webhooks, add an endpoint
          pointing at:
        </p>
        <code className="w-fit break-all rounded-md bg-surface px-3 py-2 font-mono text-[13px] text-foreground">
          {config.address.url}
        </code>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Subscribe it to exactly these events:
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {config.confirmationEvents.map((event) => (
            <li key={event}>
              <Env>{event}</Env>
            </li>
          ))}
        </ul>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Then paste its signing secret into <Env>STRIPE_WEBHOOK_SECRET</Env> on
          the server and restart. Add the same endpoint under{" "}
          <em>Connect</em> so events from connected accounts arrive too.
        </p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// How customers can pay
// ---------------------------------------------------------------------------

function HowCustomersPayCard({ config }: { config: PaymentsTabConfig }) {
  const confirms = config.setup.automatic || config.env.webhookReady;
  const live = config.env.live && confirms;
  const readerReady =
    config.env.live && config.readers.some((reader) => reader.status === "online");

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
          off="Needs your Stripe account connected, so payments can confirm themselves."
        />
        <Method
          icon={ICONS.deposit}
          on={config.cardOnFileReady}
          title="Card on file"
          where="Save a card from a customer's page, then charge an invoice in one click."
          off="Needs online payments working first."
        />
        <Method
          icon={ReaderIcon}
          on={readerReady}
          title="Card machine at the counter"
          where="A 'Card machine' option on the till and on the invoice payment box."
          off="Add a card machine below to switch this on."
        />
        <Method
          icon={ICONS.recurring}
          on={config.cardOnFileReady}
          title="Automatic repeat charges"
          where="Repeat schedules can charge the card on file the moment they raise an invoice."
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
// Card machines
// ---------------------------------------------------------------------------

function CardMachinesCard({
  config,
  registerReaderAction,
  pairPracticeReaderAction,
  renameReaderAction,
  forgetReaderAction,
}: {
  config: PaymentsTabConfig;
  registerReaderAction: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<ReaderResult>;
  pairPracticeReaderAction: (input: { label: string }) => Promise<ReaderResult>;
  renameReaderAction: (input: {
    readerId: string;
    label: string;
  }) => Promise<ReaderResult>;
  forgetReaderAction: (input: { readerId: string }) => Promise<SimpleResult>;
}) {
  return (
    <Card>
      <CardHeader
        icon={ReaderIcon}
        title="Card machines"
        description="The machines your customers tap their card on, at this shop."
        action={
          <>
            {config.canPairPractice ? (
              <PracticeReaderButton action={pairPracticeReaderAction} />
            ) : null}
            <ConnectMachineDialog action={registerReaderAction} />
          </>
        }
      />

      <CardContent className="flex flex-col gap-3">
        {config.readersError ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            {config.readersError}
          </p>
        ) : config.readers.length === 0 ? (
          <EmptyState
            icon={ReaderIcon}
            title="No card machine connected"
            hint={
              config.hasReaderLocation
                ? "Put yours on wifi, read the pairing code off its screen, and press Connect a card machine."
                : "Press Connect a card machine — RepairPilot files it under this shop's address for you."
            }
            className="rounded-lg border border-dashed border-border py-10"
          />
        ) : (
          config.readers.map((reader) => (
            <ReaderRow
              key={reader.id}
              reader={reader}
              renameAction={renameReaderAction}
              forgetAction={forgetReaderAction}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ReaderRow({
  reader,
  renameAction,
  forgetAction,
}: {
  reader: ReaderItem;
  renameAction: (input: {
    readerId: string;
    label: string;
  }) => Promise<ReaderResult>;
  forgetAction: (input: { readerId: string }) => Promise<SimpleResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const online = reader.status === "online";

  const forget = () => {
    startTransition(async () => {
      const result = await forgetAction({ readerId: reader.id });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold text-foreground">
          {reader.label}
          {reader.simulated ? (
            <StatusPill tone="waiting" label="Practice machine" size="sm" dot={false} />
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span>{online ? "Switched on and ready" : "Not answering"}</span>
          {reader.batteryPercent !== null ? (
            <span className="flex items-center gap-1">
              <BatteryMedium className="size-3.5" />
              {reader.batteryPercent}%
            </span>
          ) : null}
          {reader.lastSeenAt ? (
            <span>Last seen {formatDateTime(reader.lastSeenAt)}</span>
          ) : null}
          {reader.serialNumber ? (
            <span className="font-mono">{reader.serialNumber}</span>
          ) : null}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusPill
          tone={online ? "success" : "neutral"}
          label={online ? "Online" : "Offline"}
        />
        <RenameReaderDialog reader={reader} action={renameAction} />
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={forget}
          aria-label={`Forget ${reader.label}`}
        >
          {pending ? <Loader2 className="animate-spin" /> : <ForgetIcon aria-hidden />}
          Forget
        </Button>
      </div>
    </div>
  );
}

function RenameReaderDialog({
  reader,
  action,
}: {
  reader: ReaderItem;
  action: (input: {
    readerId: string;
    label: string;
  }) => Promise<ReaderResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(reader.label);
  const [pending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await action({ readerId: reader.id, label });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Now called ${result.reader.label}.`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setLabel(reader.label);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Rename ${reader.label}`}>
          <EditIcon aria-hidden /> Rename
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename this card machine</DialogTitle>
          <DialogDescription>
            Only your staff ever see this name. Somewhere in the shop is the
            useful sort: &ldquo;Front counter&rdquo;, &ldquo;Repair bench&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`rename-${reader.id}`}>Name</Label>
            <Input
              id={`rename-${reader.id}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
              autoFocus
              required
            />
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
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One click, because a practice machine needs nothing from anybody. */
function PracticeReaderButton({
  action,
}: {
  action: (input: { label: string }) => Promise<ReaderResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const add = () => {
    startTransition(async () => {
      const result = await action({ label: "Practice machine" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Practice machine added — it approves every card and takes no money.",
      );
      router.refresh();
    });
  };

  return (
    <Button variant="outline" disabled={pending} onClick={add}>
      {pending ? <Loader2 className="animate-spin" /> : <AddIcon aria-hidden />}
      Add a practice machine
    </Button>
  );
}

/**
 * Connecting a machine, as three numbered things to do.
 *
 * The old dialog assumed the owner already knew what a registration code was
 * and where the reader keeps it. Nobody does the first time. So the steps are
 * on screen, in order, in the words printed on the machine itself.
 */
function ConnectMachineDialog({
  action,
}: {
  action: (input: {
    registrationCode: string;
    label: string;
  }) => Promise<ReaderResult>;
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
      toast.success(`${result.reader.label} is connected.`);
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
        <Button>
          <ConnectIcon aria-hidden /> Connect a card machine
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a card machine</DialogTitle>
          <DialogDescription>
            Three things, and it is done. The machine needs to be on the same
            wifi as this computer.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2.5">
          <Step n={1}>
            Switch the machine on and join it to your shop wifi.
          </Step>
          <Step n={2}>
            On the machine, hold the button until the settings menu appears and
            choose to generate a pairing code. It shows three words.
          </Step>
          <Step n={3}>Type those three words below, straight away — they expire.</Step>
        </ol>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="registrationCode">Pairing code</Label>
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
                  <Loader2 className="animate-spin" /> Connecting…
                </>
              ) : (
                <>
                  <ConnectIcon aria-hidden /> Connect
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11.5px] font-bold text-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Test payments
// ---------------------------------------------------------------------------

/**
 * The button somebody presses when a card just got refused.
 *
 * It does real work — see lib/payments/health.ts — and every failing line
 * carries the one thing to do about it. That is the whole design: a self-check
 * that only says "something is wrong" is a self-check nobody presses twice.
 */
function HealthCard({
  testPaymentsAction,
}: {
  testPaymentsAction: () => Promise<
    { ok: true; health: PaymentsHealth } | { ok: false; error: string }
  >;
}) {
  const [health, setHealth] = React.useState<PaymentsHealth | null>(null);
  const [pending, startTransition] = React.useTransition();

  const run = () => {
    startTransition(async () => {
      const result = await testPaymentsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHealth(result.health);
      if (result.health.ok) toast.success("Everything checked out.");
      else toast.error("Something needs your attention — see the list below.");
    });
  };

  return (
    <Card>
      <CardHeader
        icon={Stethoscope}
        title="Test payments"
        description="Checks every part of taking a card, end to end. Nothing is charged."
        action={
          <Button variant="outline" disabled={pending} onClick={run}>
            {pending ? <Loader2 className="animate-spin" /> : <Stethoscope />}
            {pending ? "Checking…" : "Test payments"}
          </Button>
        }
      />

      {health ? (
        <CardContent className="flex flex-col gap-2.5">
          <p className="text-[13px] text-muted-foreground">
            Checked {formatDateTime(health.ranAt)}.
          </p>
          {health.lines.map((line) => (
            <HealthRow key={line.id} line={line} />
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function HealthRow({ line }: { line: CheckLine }) {
  const Icon =
    line.status === "pass"
      ? CheckCircle2
      : line.status === "skipped"
        ? MinusCircle
        : line.status === "warn"
          ? CircleAlert
          : TriangleAlert;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        line.status === "fail"
          ? "border-destructive/40 bg-destructive-soft"
          : line.status === "warn"
            ? "border-border bg-status-waiting-bg"
            : "border-border bg-surface-hover",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          line.status === "pass" && "text-status-resolved",
          line.status === "warn" && "text-status-waiting-fg",
          line.status === "fail" && "text-destructive",
          line.status === "skipped" && "text-faint-foreground",
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[14px] font-bold text-foreground">{line.label}</span>
        <span className="text-[13.5px] leading-relaxed text-muted-foreground">
          {line.detail}
        </span>
        {line.fix ? (
          <span className="text-[13.5px] font-semibold leading-relaxed text-foreground">
            {line.fix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server environment
// ---------------------------------------------------------------------------

function ServerCard({ config }: { config: PaymentsTabConfig }) {
  const { env, setup, testMode } = config;
  // Dangerous only when NOTHING can confirm a payment: a connected shop with
  // its own automatic setup does not need the server-wide secret at all.
  const takingMoneyBlind = env.live && !env.webhookReady && !setup.automatic;

  return (
    <Card>
      <CardHeader
        icon={ICONS.settings}
        title="Server setup"
        description="Set by whoever runs this RepairPilot server, not from this screen. Only whether each value is present is shown — never the value."
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

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          <Env>STRIPE_WEBHOOK_SECRET</Env> is only needed for shops that have
          not connected their own Stripe account. A connected shop gets its own,
          created automatically — see <em>How you get paid</em> above.
        </p>

        {takingMoneyBlind ? (
          <p className="flex items-start gap-2.5 rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Customers can be charged, but nothing is set up to confirm it —
              every confirmation from Stripe is rejected, so paid invoices will
              stay outstanding. Connect this shop&rsquo;s Stripe account above,
              or set <Env>STRIPE_WEBHOOK_SECRET</Env> on the server.
            </span>
          </p>
        ) : null}

        {env.live && !env.currencySupported ? (
          <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
            <Env>PAYMENTS_CURRENCY</Env> is set to{" "}
            <span className="font-mono">{env.currency}</span>, which is not a
            two-decimal currency. RepairPilot stores every amount in cents, so
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
