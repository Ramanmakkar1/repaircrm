"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Link2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  disconnectIntegrationAction,
  saveXeroAccountCodesAction,
  syncNowAction,
} from "@/app/(app)/settings/integration-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS, ICONS, type LucideIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { attentionBorder } from "./card-attention";
import { shopDateTime } from "./shop-time";
import { useShopZone } from "./shop-zone";
import { TechnicalDetails } from "./technical-details";
import {
  ENTITY_LABEL,
  SYNC_ENTITIES,
  syncLine,
  type IntegrationCard,
} from "@/lib/integrations/types";

/**
 * Settings → Accounting (the `integrations` panel).
 *
 * One question: "do my invoices and payments reach my books?" Two cards,
 * QuickBooks and Xero, each with a status word and one button. What an
 * installer needs to switch one on (variable names, the address to register)
 * sits under Technical details. The old shortcut cards to Payments, Messaging
 * and Developer access are gone: the Settings hub and the Shop link screen
 * already show those, once.
 *
 * Nothing secret is on this screen. Whether an env var is populated crosses
 * from the server; its value never does.
 */

/** What the server hands down. No tokens, ever — see lib/integrations/cards.ts. */
export type IntegrationsConfig = {
  cards: IntegrationCard[];
  /** Stripe Connect: the shop's own account id is set. */
  stripeConnected: boolean;
  /** Server-wide Stripe keys are present, so checkout can run at all. */
  stripeLive: boolean;
  emailDriver: string;
  smsDriver: string;
  apiKeyCount: number;
  appUrl: string;
  /** One line from the OAuth round trip, when it just came back. */
  notice: { tone: "ok" | "bad"; text: string } | null;
};

/**
 * Where each connection state sits in the app-wide tone language (see
 * `components/ui/badge.tsx`). Declared here rather than in
 * `lib/integrations/types.ts` because this tab is the only screen that shows a
 * connection as a chip — and only `StatusPill` knows what a tone looks like, so
 * "Connected" here is the same green as a paid invoice.
 *
 * `none` and `disconnected` are both grey: neither is a fault, they are just
 * two ways of not being plugged in.
 */
const CONNECTION_META: Record<
  IntegrationCard["status"],
  { label: string; tone: StatusTone }
> = {
  connected: { label: "Connected", tone: "success" },
  pending: { label: "Needs an answer", tone: "waiting" },
  error: { label: "Sending failed", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
  none: { label: "Not connected", tone: "neutral" },
};

/** An unconfigured server outranks whatever a stored connection claims. */
function connectionMeta(card: IntegrationCard) {
  if (!card.configured) return { label: "Not set up yet", tone: "neutral" as const };
  return CONNECTION_META[card.status] ?? CONNECTION_META.none;
}

const SyncIcon = ACTIONS.refresh;
const ConnectIcon = ACTIONS.connect;
const DisconnectIcon = ACTIONS.disconnect;
const NextIcon = ACTIONS.next;
const DownloadIcon = ACTIONS.download;
const SaveIcon = ACTIONS.save;

export function IntegrationsTab({ config }: { config: IntegrationsConfig }) {
  return (
    <div className="flex flex-col gap-6">
      {config.notice ? (
        <p
          role="status"
          className={cn(
            "flex items-start gap-2.5 rounded-md px-4 py-3 text-[14px] font-medium leading-relaxed",
            config.notice.tone === "ok"
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-status-overdue-bg text-status-overdue-fg",
          )}
        >
          {config.notice.tone === "ok" ? (
            <CheckCircle2 className="mt-px size-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-px size-4 shrink-0" />
          )}
          {config.notice.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel hint="Your invoices, payments and customers are sent across by themselves, so the books match the shop.">
          Your accounting software
        </SectionLabel>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {config.cards.map((card) => (
            <ProviderCard key={card.provider} card={card} />
          ))}
        </div>
      </section>

      <QuickCard
        icon={ICONS.exportData}
        title="Spreadsheet for your accountant"
        tone="success"
        status="Always available"
        body="Download your invoices as a spreadsheet: the file every accountant already knows how to open."
        href={`${config.appUrl}/api/exports/invoices.csv`}
        cta="Download invoices"
        external
      />

      {config.cards.some((card) => !card.configured) ? (
        <TechnicalDetails>
          {config.cards
            .filter((card) => !card.configured)
            .map((card) => (
              <div key={card.provider} className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">{card.label}</h3>
                <NotConfigured
                  card={card}
                  missing={card.envVars.filter(
                    (variable) => !variable.set && variable.name !== "QBO_ENVIRONMENT",
                  )}
                />
              </div>
            ))}
        </TechnicalDetails>
      ) : null}
    </div>
  );
}

/** A plainly titled group of cards, with one line saying what is in it. */
function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-[17px] font-semibold leading-snug text-foreground">
        {children}
      </h2>
      <p className="text-[14px] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One accounting provider
// ---------------------------------------------------------------------------

function ProviderCard({ card }: { card: IntegrationCard }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"sync" | "disconnect" | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const connected = card.status === "connected" || card.status === "error";
  const status = connectionMeta(card);
  async function sync() {
    setBusy("sync");
    const result = await syncNowAction(card.provider);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
    } else {
      toast.success(result.summary);
    }
    router.refresh();
  }

  async function disconnect() {
    setBusy("disconnect");
    const result = await disconnectIntegrationAction(card.provider);
    setBusy(null);
    setConfirming(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${card.label} disconnected.`);
    router.refresh();
  }

  return (
    // The state lives in the pill beside the title, and in a tinted border only
    // when the card needs something doing; the card itself stays white, so a
    // hub of six reads as a hub.
    <Card className={cn("flex flex-col", attentionBorder(status.tone))}>
      <CardHeader
        icon={Building2}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {card.label}
            <StatusPill size="sm" tone={status.tone} label={status.label} />
          </span>
        }
        description={describeStatus(card)}
      />

      <CardContent className="flex flex-1 flex-col gap-4">
        {!card.configured ? (
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {card.label} is not switched on for your shop yet. Ask your
            installer to connect it; what they need is under Technical details
            below. Until then, your books can be kept with the spreadsheet
            download.
          </p>
        ) : card.status === "pending" ? (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            This Xero login covers {card.tenantChoices.length} organisations.
            Pick the one this shop&apos;s books belong in before anything is
            written.
          </p>
        ) : connected ? (
          <ConnectedBody card={card} />
        ) : (
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Sends your customers, products, invoices and payments across so the
            books match the shop without anyone typing them twice. Nothing comes
            back the other way: Repairs helper stays where the work is recorded.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-2">
        {!card.configured ? (
          <span className="text-[14px] font-medium text-muted-foreground">
            Next step: ask your installer to connect {card.label}.
          </span>
        ) : card.status === "pending" ? (
          <Button asChild className="h-12 px-5">
            <Link href="/settings/integrations/xero-tenant">
              Choose your Xero books <NextIcon aria-hidden />
            </Link>
          </Button>
        ) : connected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-12 px-5" onClick={sync} disabled={busy !== null}>
                <SyncIcon
                  aria-hidden
                  className={busy === "sync" ? "animate-spin" : ""}
                />
                {busy === "sync" ? "Sending…" : "Send now"}
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 px-5"
                aria-label={`Reconnect ${card.label}`}
              >
                <a href={`/api/integrations/${card.provider}/connect`}>
                  <ConnectIcon aria-hidden /> Reconnect
                </a>
              </Button>
            </div>
            {/* Reads as what it is: the one button here that takes something away. */}
            <Button
              variant="ghost"
              className="h-12 text-destructive hover:bg-destructive-soft hover:text-destructive"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              <DisconnectIcon aria-hidden /> Disconnect
            </Button>
          </>
        ) : (
          <Button asChild className="h-12 px-5">
            <a href={`/api/integrations/${card.provider}/connect`}>
              <ConnectIcon aria-hidden /> Connect {card.label}
            </a>
          </Button>
        )}
      </CardFooter>

      <Dialog
        open={confirming}
        onOpenChange={(next) => !busy && setConfirming(next)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect {card.label}?</DialogTitle>
            <DialogDescription>
              Sending stops immediately. What has already been sent stays in{" "}
              {card.label} untouched, and reconnecting the same company later
              picks up where this left off rather than sending everything again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={disconnect}
            >
              {busy === "disconnect" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <DisconnectIcon aria-hidden />
              )}
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function describeStatus(card: IntegrationCard): string {
  if (!card.configured) return "Not set up for your shop yet.";
  switch (card.status) {
    case "connected":
      return card.tenantName
        ? `Connected to ${card.tenantName}.`
        : "Connected.";
    case "error":
      return "Connected, but the last send did not go through.";
    case "pending":
      return "Almost there — one question left.";
    case "disconnected":
      return "Disconnected. Reconnect to start sending again.";
    default:
      return "Not connected.";
  }
}

function NotConfigured({
  card,
  missing,
}: {
  card: IntegrationCard;
  missing: { name: string; set: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        {missing.length === 1
          ? `${missing[0].name} is missing from this server's environment.`
          : `${missing.map((v) => v.name).join(" and ")} are missing from this server's environment.`}{" "}
        Until they are set, {card.label} cannot be connected at all — the
        button below would only lead to a broken consent screen.
      </p>
      <ul className="flex flex-col gap-1.5">
        {card.envVars.map((variable) => (
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
                : variable.name === "QBO_ENVIRONMENT"
                  ? "not set — defaults to sandbox"
                  : "not set"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Redirect URI to register
        </span>
        <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[14px] text-foreground">
          {card.redirectUri}
        </code>
      </div>
    </div>
  );
}

function ConnectedBody({ card }: { card: IntegrationCard }) {
  const zone = useShopZone();
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {SYNC_ENTITIES.map((entity) => (
          <div key={entity} className="flex flex-col gap-0.5">
            <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ENTITY_LABEL[entity]}
            </dt>
            <dd className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                {card.linked[entity]}
              </span>
              <Link2 className="size-3.5 text-faint-foreground" />
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-muted-foreground">
        <span>
          Last sent:{" "}
          <span className="font-semibold text-foreground">
            {card.lastSyncAt ? shopDateTime(card.lastSyncAt, zone) : "never"}
          </span>
        </span>
        {card.lastSummary ? <span>{syncLine(card.lastSummary)}</span> : null}
      </div>

      {card.lastError ? (
        <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[14px] font-medium leading-relaxed text-status-overdue-fg">
          {card.lastError}
        </p>
      ) : null}

      {card.provider === "xero" ? <AccountCodes card={card} /> : null}
    </div>
  );
}

/**
 * Xero books every invoice line and every payment against a numbered account
 * from the organisation's own chart. The defaults are Xero's demo-company
 * numbers; a real organisation will very likely differ, and getting it wrong
 * is a rejected invoice rather than a wrong one.
 */
function AccountCodes({ card }: { card: IntegrationCard }) {
  const router = useRouter();
  const [sales, setSales] = React.useState(card.salesAccountCode);
  const [bank, setBank] = React.useState(card.bankAccountCode);
  const [busy, setBusy] = React.useState(false);

  const dirty =
    sales.trim() !== card.salesAccountCode || bank.trim() !== card.bankAccountCode;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveXeroAccountCodesAction({
      salesAccountCode: sales,
      bankAccountCode: bank,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Account codes saved.");
    router.refresh();
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-hover/60 p-4"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Chart of accounts
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="xero-sales">Sales account code</Label>
          <Input
            id="xero-sales"
            value={sales}
            onChange={(event) => setSales(event.target.value)}
            maxLength={10}
            placeholder="200"
            className="bg-surface"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="xero-bank">Bank account code</Label>
          <Input
            id="xero-bank"
            value={bank}
            onChange={(event) => setBank(event.target.value)}
            maxLength={10}
            placeholder="090"
            className="bg-surface"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Invoice lines are booked to the sales code; payments are banked into
          the bank code.
        </p>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !dirty}>
          {busy ? <Loader2 className="animate-spin" /> : <SaveIcon aria-hidden />}
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Signposts
// ---------------------------------------------------------------------------

function QuickCard({
  icon,
  title,
  tone,
  status,
  body,
  href,
  cta,
  external,
}: {
  icon: LucideIcon;
  title: string;
  /** The tone this signpost is in — green when it is actually plugged in. */
  tone: StatusTone;
  status: string;
  body: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col", attentionBorder(tone))}>
      <CardHeader
        icon={icon}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {title}
            <StatusPill size="sm" tone={tone} label={status} />
          </span>
        }
      />
      <CardContent className="flex-1">
        <p className="text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          {external ? (
            <a href={href}>
              <DownloadIcon aria-hidden /> {cta}
            </a>
          ) : (
            <Link href={href}>
              {cta} <NextIcon aria-hidden />
            </Link>
          )}
        </Button>
      </CardFooter>
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
