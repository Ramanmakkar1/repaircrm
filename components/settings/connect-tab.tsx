"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { updatePublicHubAction } from "@/app/(app)/settings/actions";
import { EmbedSnippet } from "@/components/leads/embed-snippet";
import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  HUB_CARDS,
  HUB_CARD_HINT,
  HUB_CARD_LABEL,
  type PublicHubSettings,
} from "./hub-meta";

/**
 * Settings → Connect. The front door.
 *
 * A shop owner asked for "one link to connect everything", and this is the one
 * screen that answers it: the shop's public link at the top, then every other
 * connection as a single row with one button and a status you cannot misread.
 *
 * IT IS A FRONT DOOR, NOT A SECOND IMPLEMENTATION. Everything below the first
 * card is configured somewhere else in Settings and LINKS there — Stripe
 * Connect, the card reader, the message drivers, accounting, developer access.
 * Duplicating those controls here is how two sources of truth get born. The one
 * thing this screen owns outright is the shop link itself, because it is new
 * and it has nowhere else to live.
 *
 * PLAIN ENGLISH IS A RULE HERE, not a preference. Nothing above the Developer
 * row is allowed to say "webhook", "endpoint", "OAuth" or "API": a shop owner
 * setting up card payments on a Tuesday morning should not have to learn any of
 * those words to finish.
 */

export type ConnectStatus = "connected" | "attention" | "off";

/**
 * This screen's three states in the app-wide tone language, so a Connect row
 * reads the same green/amber/grey as every other status in RepairPilot.
 */
const CONNECT_TONE: Record<ConnectStatus, StatusTone> = {
  connected: "success",
  attention: "active",
  off: "neutral",
};

export type ConnectConfig = {
  hub: PublicHubSettings;
  slug: string;
  /** Absolute `/s/<slug>` — the one link. */
  shopUrl: string;
  /** PNG data URL of the shop link, rendered on the server. */
  qrDataUrl: string;
  /** Absolute origin, for the website snippet. */
  appUrl: string;
  /** Public check-in has its own switch on the Check-in tab. */
  checkinEnabled: boolean;
  payments: {
    /** This shop's own Stripe account is attached. */
    connected: boolean;
    /** Server-wide Stripe keys exist at all. */
    live: boolean;
    /** Connected, but Stripe says it cannot take charges yet. */
    incomplete: boolean;
  };
  readers: { count: number; online: number };
  messaging: { emailLive: boolean; smsLive: boolean };
  accounting: { connected: number; error: number; configured: boolean };
  developer: { keyCount: number; webhookCount: number };
};

export function ConnectTab({ config }: { config: ConnectConfig }) {
  return (
    <div className="flex flex-col gap-5">
      <ShopLinkCard config={config} />
      <ConnectionsCard config={config} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1 — Your shop link
// ---------------------------------------------------------------------------

function ShopLinkCard({ config }: { config: ConnectConfig }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(config.hub.enabled);
  const [indexable, setIndexable] = React.useState(config.hub.indexable);
  const [cards, setCards] = React.useState(config.hub.cards);
  const [hours, setHours] = React.useState(config.hub.hours);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await updatePublicHubAction({ enabled, indexable, cards, hours });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Shop link saved.");
    router.refresh();
  }

  const snippet = `<script src="${config.appUrl}/embed.js" data-shop="${config.slug}" data-mode="button"></script>`;

  return (
    <Card>
      <CardHeader
        icon={ACTIONS.copyLink}
        title="Your shop link"
        description="One link for everything. Put it on your website, your Google listing, your receipts and the sticker in the window."
      />

      <CardContent className="flex flex-col gap-6">
        <label className="flex items-start justify-between gap-6">
          <span className="flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold text-foreground">
              Your shop link is {enabled ? "live" : "off"}
            </span>
            <span className="text-[13.5px] leading-relaxed text-muted-foreground">
              While this is off the link returns a 404 — the same answer a shop
              that has never existed gives.
            </span>
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Publish the shop link"
          />
        </label>

        {/* ------------------------------------------------- link + QR code */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-hover px-4 py-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <CopyRow label="Your link" value={config.shopUrl} openable />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Everything a customer might want is on it: book a device in, check
              a repair, ask for a price, pay a bill.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* Rendered to a data URL on the server, so no QR library ever
                reaches the browser for a picture that only changes when the
                shop's slug does.
                eslint-disable: next/image cannot optimise a data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.qrDataUrl}
              alt="QR code for your shop link"
              className="size-32 rounded-lg border border-border bg-white p-1.5"
            />
            <Button size="sm" variant="outline" asChild>
              {/* The data URL IS a PNG, so the download needs no round trip. */}
              <a href={config.qrDataUrl} download={`${config.slug}-shop-link.png`}>
                <ACTIONS.download /> Download QR
              </a>
            </Button>
          </div>
        </div>

        {/* --------------------------------------------------- what is on it */}
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
            What&rsquo;s on the page
          </span>

          <div className="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-foreground">
                Check in a device
              </span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">
                {config.checkinEnabled
                  ? "On. Switched on and off under Check-in & reviews."
                  : "Off. Switch it on under Check-in & reviews to add it here."}
              </span>
            </span>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/settings?tab=checkin">Open</Link>
            </Button>
          </div>

          {HUB_CARDS.map((key) => (
            <label
              key={key}
              className="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-foreground">
                  {HUB_CARD_LABEL[key]}
                </span>
                <span className="text-[13px] leading-relaxed text-muted-foreground">
                  {HUB_CARD_HINT[key]}
                </span>
              </span>
              <Switch
                checked={cards[key]}
                onCheckedChange={(next) =>
                  setCards((current) => ({ ...current, [key]: next }))
                }
                aria-label={HUB_CARD_LABEL[key]}
              />
            </label>
          ))}
        </div>

        {/* --------------------------------------------------------- hours */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hub-hours">Opening hours (optional)</Label>
          <Textarea
            id="hub-hours"
            rows={3}
            maxLength={600}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder={"Mon–Fri 9am–6pm\nSat 10am–4pm\nSunday closed"}
          />
          <p className="text-[12.5px] text-muted-foreground">
            Shown under your address. Leave it blank and the line is left out.
          </p>
        </div>

        <label className="flex items-start justify-between gap-6">
          <span className="flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold text-foreground">
              Let search engines list this page
            </span>
            <span className="text-[13.5px] leading-relaxed text-muted-foreground">
              Off while you get it right — a half-finished page in a search
              result is a phone call you did not want. Turn it on when the page
              says what you want it to say.
            </span>
          </span>
          <Switch
            checked={indexable}
            onCheckedChange={setIndexable}
            aria-label="Allow search engines to list the shop link"
          />
        </label>

        {/* ------------------------------------------------ website snippet */}
        <WebsiteSnippet
          snippet={snippet}
          slug={config.slug}
          appUrl={config.appUrl}
          previewUrl={`${config.shopUrl}?embed=1`}
          enabled={enabled && config.hub.enabled}
        />
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save shop link"}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * The one-line website integration, and the plain-HTML form for shops that
 * would rather have a form of their own.
 *
 * The script tag leads because it is the honest recommendation: it is one line,
 * it needs nothing else on their page, and it keeps working when the shop later
 * switches another card on. The raw form is still here, unchanged, for the shop
 * whose website builder will not take a script tag.
 */
function WebsiteSnippet({
  snippet,
  slug,
  appUrl,
  previewUrl,
  enabled,
}: {
  snippet: string;
  slug: string;
  appUrl: string;
  previewUrl: string;
  enabled: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Copied. Paste it into your website.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the line and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
        Put it on your website
      </span>

      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Paste this one line into your website&rsquo;s page, just before the
        closing <code className="rounded-sm bg-surface-hover px-1 py-0.5 font-mono text-[12.5px] text-foreground">&lt;/body&gt;</code>{" "}
        tag — or send it to whoever built your site and ask them to add this one
        line. It puts a &ldquo;Book a repair&rdquo; button in the corner of every
        page.
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-hover px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your one line
          </span>
          <Button size="sm" variant="soft" onClick={copy}>
            {copied ? <ACTIONS.save /> : <ACTIONS.copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <code className="block overflow-x-auto whitespace-pre rounded-md bg-surface px-3 py-2.5 font-mono text-[12.5px] text-foreground">
          {snippet}
        </code>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          What your customers will see
        </span>
        {enabled ? (
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <iframe
              src={previewUrl}
              title="Preview of your shop link"
              className="h-[420px] w-full"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[13.5px] text-muted-foreground">
            Switch your shop link on and save to see the preview.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="w-fit text-[13.5px] font-semibold text-accent hover:underline"
        >
          {showForm ? "Hide the plain form" : "Rather have a plain form on your page?"}
        </button>
        {showForm ? (
          <EmbedSnippet shopSlug={slug} endpoint={`${appUrl}/api/leads`} />
        ) : null}
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  openable,
}: {
  label: string;
  value: string;
  openable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2 font-mono text-[12.5px] text-foreground">
          {value}
        </code>
        <Button size="sm" variant="soft" onClick={copy}>
          {copied ? <ACTIONS.save /> : <ACTIONS.copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {openable ? (
          <Button size="sm" variant="outline" asChild>
            <a href={value} target="_blank" rel="noreferrer">
              <ACTIONS.openExternal /> Open
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — Everything else, one row at a time
// ---------------------------------------------------------------------------

function ConnectionsCard({ config }: { config: ConnectConfig }) {
  const { payments, readers, messaging, accounting, developer } = config;

  const rows: ConnectRowProps[] = [
    {
      icon: ICONS.payment,
      title: "Take card payments",
      body: "Customers pay their invoice by card, and the money lands in your own bank account.",
      status: payments.connected
        ? payments.incomplete
          ? "attention"
          : "connected"
        : "off",
      statusText: payments.connected
        ? payments.incomplete
          ? "Finish your details"
          : "Connected"
        : payments.live
          ? "Not set up"
          : "Not available on this server",
      href: "/settings?tab=payments",
      cta: payments.connected ? "Payment settings" : "Connect in one click",
      disabled: !payments.live && !payments.connected,
    },
    {
      icon: ICONS.cardMachine,
      title: "Card machine",
      body: "Tap-and-go at the counter. Pair a reader once and it stays paired.",
      status: readers.count > 0 ? (readers.online > 0 ? "connected" : "attention") : "off",
      statusText:
        readers.count === 0
          ? "Not set up"
          : readers.online > 0
            ? `${readers.online} of ${readers.count} switched on`
            : "None switched on",
      href: "/settings?tab=payments",
      cta: readers.count > 0 ? "Manage readers" : "Pair a reader",
      disabled: !payments.connected,
    },
    {
      icon: ACTIONS.scan,
      title: "Scan with your phone",
      body: "You don't need a scanner gun. Point a phone or tablet camera at a barcode and it goes straight into the cart — or pair your phone to the counter machine and use it as the gun.",
      status: "connected",
      statusText: "Ready to use",
      href: "/pos",
      cta: "Open the register",
    },
    {
      icon: ICONS.message,
      title: "Send email and texts",
      body: "Ticket updates, invoices and review requests go out under your shop's name.",
      status:
        messaging.emailLive && messaging.smsLive
          ? "connected"
          : messaging.emailLive || messaging.smsLive
            ? "attention"
            : "off",
      statusText:
        messaging.emailLive && messaging.smsLive
          ? "Email and texts are live"
          : messaging.emailLive
            ? "Email live, texts still logged"
            : messaging.smsLive
              ? "Texts live, email still logged"
              : "Nothing is being sent yet",
      href: "/settings?tab=messaging",
      cta: "Messaging settings",
    },
    {
      icon: ICONS.integration,
      title: "Accounting",
      body: "Your invoices and payments land in QuickBooks or Xero without anyone retyping them.",
      status:
        accounting.error > 0
          ? "attention"
          : accounting.connected > 0
            ? "connected"
            : "off",
      statusText:
        accounting.error > 0
          ? "Last sync failed"
          : accounting.connected > 0
            ? `${accounting.connected} connected`
            : accounting.configured
              ? "Not set up"
              : "Not available on this server",
      href: "/settings?tab=integrations",
      cta: accounting.connected > 0 ? "Accounting settings" : "Connect your books",
      disabled: !accounting.configured && accounting.connected === 0,
    },
    {
      icon: ICONS.apiKey,
      title: "Developer",
      body: "API keys and webhooks, for another system that needs to read or write your data.",
      status: developer.keyCount > 0 ? "connected" : "off",
      statusText:
        developer.keyCount === 0
          ? "No keys yet"
          : `${developer.keyCount} key${developer.keyCount === 1 ? "" : "s"}` +
            (developer.webhookCount > 0
              ? `, ${developer.webhookCount} webhook${developer.webhookCount === 1 ? "" : "s"}`
              : ""),
      href: "/settings?tab=api-keys",
      cta: "API & webhooks",
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={ACTIONS.connect}
        title="Connect everything else"
        description="Top to bottom, one button each. Nothing here is set up twice — every row opens the screen that actually owns it."
      />
      <CardContent className="px-0 py-0">
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <ConnectRow key={row.title} {...row} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type ConnectRowProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  status: ConnectStatus;
  statusText: string;
  href: string;
  cta: string;
  /** The action still shows, but the row reads as "you cannot finish this here". */
  disabled?: boolean;
};

function ConnectRow({
  icon,
  title,
  body,
  status,
  statusText,
  href,
  cta,
  disabled,
}: ConnectRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <IconChip
          icon={icon}
          className={
            status === "connected"
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : status === "attention"
                ? "bg-status-in-progress-bg text-status-in-progress-fg"
                : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold tracking-tight text-foreground">
              {title}
            </span>
            <StatusPill tone={CONNECT_TONE[status]} label={statusText} size="sm" />
          </div>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
      <Button
        variant={status === "off" && !disabled ? "default" : "outline"}
        size="sm"
        asChild
      >
        <Link href={href}>
          {cta} <ACTIONS.next />
        </Link>
      </Button>
    </li>
  );
}

