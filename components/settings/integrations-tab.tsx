"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Download,
  KeyRound,
  Link2,
  MessageSquare,
  Plug,
  RefreshCw,
  Unplug,
  type LucideIcon,
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import {
  ENTITY_LABEL,
  SYNC_ENTITIES,
  syncLine,
  type IntegrationCard,
} from "@/lib/integrations/types";

/**
 * Settings → Integrations.
 *
 * The hub answers one question — "what is this shop plugged into?" — and does
 * it as a calm grid of cards rather than a wall of forms. Two of them do real
 * work (QuickBooks, Xero); the rest are honest signposts to the tab or screen
 * where that particular thing is actually configured, because a settings
 * screen that quietly duplicates another settings screen is how two sources of
 * truth get born.
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

export function IntegrationsTab({ config }: { config: IntegrationsConfig }) {
  return (
    <div className="flex flex-col gap-6">
      {config.notice ? (
        <p
          className={cn(
            "rounded-md px-4 py-3 text-[13.5px] font-medium leading-relaxed",
            config.notice.tone === "ok"
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-status-overdue-bg text-status-overdue-fg",
          )}
        >
          {config.notice.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel>Accounting</SectionLabel>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {config.cards.map((card) => (
            <ProviderCard key={card.provider} card={card} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Elsewhere in RepairFlow</SectionLabel>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <QuickCard
            icon={CreditCard}
            title="Online payments"
            live={config.stripeConnected}
            status={
              config.stripeConnected
                ? "Connected"
                : config.stripeLive
                  ? "Not connected yet"
                  : "Off on this server"
            }
            body={
              config.stripeConnected
                ? "Customers can pay an invoice by card from their portal, and the money lands in your own Stripe account."
                : "Take card payments from the customer portal. Set it up on the Payments tab."
            }
            href="/settings?tab=payments"
            cta={config.stripeConnected ? "Payment settings" : "Set up payments"}
          />

          <QuickCard
            icon={MessageSquare}
            title="Email & SMS"
            live={config.emailDriver !== "log" || config.smsDriver !== "log"}
            status={`Email: ${config.emailDriver} · SMS: ${config.smsDriver}`}
            body={
              config.emailDriver === "log" && config.smsDriver === "log"
                ? "Log mode — messages are printed to the server console and filed in the outbox, but nothing leaves the building."
                : "Outbound messages are going through a live provider."
            }
            href="/settings?tab=messaging"
            cta="Messaging tab"
          />

          <QuickCard
            icon={KeyRound}
            title="API & webhooks"
            live={config.apiKeyCount > 0}
            status={
              config.apiKeyCount === 0
                ? "No keys yet"
                : `${config.apiKeyCount} key${config.apiKeyCount === 1 ? "" : "s"}`
            }
            body="Let another system read and write your customers, tickets and invoices over the REST API."
            href="/settings?tab=api-keys"
            cta="API keys tab"
          />

          <QuickCard
            icon={Download}
            title="CSV exports"
            live
            status="Always available"
            body="Download customers, invoices and payments as spreadsheets — the format every accountant already knows how to open."
            href={`${config.appUrl}/api/exports/invoices.csv`}
            cta="Download invoices"
            external
          />
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
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
  const missing = card.envVars.filter(
    (variable) => !variable.set && variable.name !== "QBO_ENVIRONMENT",
  );

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
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3.5">
        <IconChip
          icon={Building2}
          className={
            // An unconfigured server outranks whatever a stored connection
            // says: green next to "not configured on this server" reads as a
            // working integration, and it is not one.
            !card.configured
              ? "bg-surface-hover text-muted-foreground"
              : card.status === "connected"
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : card.status === "error"
                  ? "bg-status-overdue-bg text-status-overdue-fg"
                  : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{card.label}</CardTitle>
          <CardDescription>{describeStatus(card)}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {!card.configured ? (
          <NotConfigured card={card} missing={missing} />
        ) : card.status === "pending" ? (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            This Xero login covers {card.tenantChoices.length} organisations.
            Pick the one this shop&apos;s books belong in before anything is
            written.
          </p>
        ) : connected ? (
          <ConnectedBody card={card} />
        ) : (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Pushes your customers, products, invoices and payments across so the
            books match the shop without anyone retyping them. Nothing is ever
            pulled back — RepairFlow stays the place work is recorded.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-2">
        {!card.configured ? (
          <span className="text-[13px] text-muted-foreground">
            Ask whoever runs this server to add the variables above.
          </span>
        ) : card.status === "pending" ? (
          <Button asChild size="sm">
            <Link href="/settings/integrations/xero-tenant">
              Pick an organisation <ArrowRight />
            </Link>
          </Button>
        ) : connected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={sync} disabled={busy !== null}>
                <RefreshCw className={busy === "sync" ? "animate-spin" : ""} />
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                aria-label={`Reconnect ${card.label}`}
              >
                <a href={`/api/integrations/${card.provider}/connect`}>
                  <Plug /> Reconnect
                </a>
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              <Unplug /> Disconnect
            </Button>
          </>
        ) : (
          <Button asChild size="sm">
            <a href={`/api/integrations/${card.provider}/connect`}>
              <Plug /> Connect {card.label}
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
              Syncing stops immediately. What has already been pushed stays in{" "}
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
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function describeStatus(card: IntegrationCard): string {
  if (!card.configured) return "Not configured on this server.";
  switch (card.status) {
    case "connected":
      return card.tenantName
        ? `Connected to ${card.tenantName}.`
        : "Connected.";
    case "error":
      return "Connected, but the last attempt failed.";
    case "pending":
      return "Almost there — one question left.";
    case "disconnected":
      return "Disconnected. Reconnect to resume syncing.";
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
        <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[12.5px] text-foreground">
          {card.redirectUri}
        </code>
      </div>
    </div>
  );
}

function ConnectedBody({ card }: { card: IntegrationCard }) {
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-muted-foreground">
        <span>
          Last sync:{" "}
          <span className="font-semibold text-foreground">
            {card.lastSyncAt ? formatWhen(card.lastSyncAt) : "never"}
          </span>
        </span>
        {card.lastSummary ? <span>{syncLine(card.lastSummary)}</span> : null}
      </div>

      {card.lastError ? (
        <p className="rounded-md bg-status-overdue-bg px-4 py-3 text-[13.5px] font-medium leading-relaxed text-status-overdue-fg">
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
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Invoice lines are booked to the sales code; payments are banked into
          the bank code.
        </p>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !dirty}>
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
  live,
  status,
  body,
  href,
  cta,
  external,
}: {
  icon: LucideIcon;
  title: string;
  live: boolean;
  status: string;
  body: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3.5">
        <IconChip
          icon={icon}
          className={
            live
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{status}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          {external ? (
            <a href={href}>
              {cta} <ArrowRight />
            </a>
          ) : (
            <Link href={href}>
              {cta} <ArrowRight />
            </Link>
          )}
        </Button>
      </CardFooter>
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

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}
