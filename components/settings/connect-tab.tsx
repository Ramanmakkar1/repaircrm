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
  CardHeader,
} from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { SaveBar, type SaveBarState } from "./save-bar";
import { ShareLinkActions } from "./share-link";
import { Switch } from "./settings-switch";
import { TechnicalDetails } from "./technical-details";
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
 * reads the same green/amber/grey as every other status in Repairs helper.
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1 — Your shop link
// ---------------------------------------------------------------------------

type HubDraft = Pick<PublicHubSettings, "enabled" | "indexable" | "cards" | "hours">;

const sameHub = (a: HubDraft, b: HubDraft) =>
  a.enabled === b.enabled &&
  a.indexable === b.indexable &&
  a.hours === b.hours &&
  HUB_CARDS.every((key) => a.cards[key] === b.cards[key]);

function ShopLinkCard({ config }: { config: ConnectConfig }) {
  const router = useRouter();
  const initial: HubDraft = {
    enabled: config.hub.enabled,
    indexable: config.hub.indexable,
    cards: config.hub.cards,
    hours: config.hub.hours,
  };
  const [saved, setSaved] = React.useState<HubDraft>(initial);
  const [draft, setDraft] = React.useState<HubDraft>(initial);
  const [busy, setBusy] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const dirty = !sameHub(draft, saved);

  function edit(patch: Partial<HubDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setJustSaved(false);
    setProblem(null);
  }

  async function save() {
    if (!dirty) {
      setJustSaved(true);
      return;
    }
    setBusy(true);
    const result = await updatePublicHubAction(draft);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error);
      toast.error(result.error);
      return;
    }
    setSaved(draft);
    setJustSaved(true);
    toast.success("Saved.");
    router.refresh();
  }

  const snippet = `<script src="${config.appUrl}/embed.js" data-shop="${config.slug}" data-mode="button"></script>`;
  const state: SaveBarState = busy ? "saving" : dirty ? "dirty" : justSaved ? "saved" : "clean";

  return (
    <>
      <Card>
        <CardHeader
          icon={ACTIONS.copyLink}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Your shop link
              <StatusPill tone={draft.enabled ? "success" : "neutral"} label={draft.enabled ? "On" : "Off"} />
            </span>
          }
          description="One link for everything: customers check a repair, book a visit, ask for a price and pay a bill. Put it on your website, your Google listing, receipts and the window."
        />

        <CardContent className="flex flex-col gap-6">
          <label className="flex items-center justify-between gap-6">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold text-foreground">
                Your shop link is {draft.enabled ? "on" : "off"}
              </span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">
                {draft.enabled
                  ? "Anyone with the link or the QR code can open your page."
                  : "While it is off, the link shows nothing, as if the page did not exist."}
              </span>
            </span>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) => edit({ enabled })}
              words
              aria-label="Your shop link is on"
            />
          </label>

          <ShareLinkActions
            url={config.shopUrl}
            qrDataUrl={config.qrDataUrl}
            linkName="shop link"
            signTitle="Scan for repairs, prices and payments"
            signLine="Check your repair, book a visit, ask for a price or pay a bill."
            fileName={`${config.slug}-shop-link.png`}
          />

          {/* --------------------------------------------------- what is on it */}
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-semibold">What&rsquo;s on the page</span>

            <div className="flex items-center justify-between gap-6 rounded-xl border border-border px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">
                  Check in a device
                </span>
                <span className="text-[14px] leading-relaxed text-muted-foreground">
                  {config.checkinEnabled
                    ? "On. Switched on and off under Check-in & reviews."
                    : "Off. Switch it on under Check-in & reviews to add it here."}
                </span>
              </span>
              <Button variant="outline" className="h-12 px-4" asChild>
                <Link href="/settings?tab=checkin">Open</Link>
              </Button>
            </div>

            {HUB_CARDS.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-6 rounded-xl border border-border px-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-foreground">
                    {HUB_CARD_LABEL[key]}
                  </span>
                  <span className="text-[14px] leading-relaxed text-muted-foreground">
                    {HUB_CARD_HINT[key]}
                  </span>
                </span>
                <Switch
                  checked={draft.cards[key]}
                  onCheckedChange={(next) => edit({ cards: { ...draft.cards, [key]: next } })}
                  words
                  aria-label={HUB_CARD_LABEL[key]}
                />
              </label>
            ))}
          </div>

          {/* --------------------------------------------------------- hours */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hub-hours" className="text-[15px]">Opening hours (optional)</Label>
            <Textarea
              id="hub-hours"
              rows={3}
              maxLength={600}
              value={draft.hours}
              onChange={(event) => edit({ hours: event.target.value })}
              placeholder={"Mon–Fri 9am–6pm\nSat 10am–4pm\nSunday closed"}
              className="text-base"
            />
            <p className="text-[14px] text-muted-foreground">
              Shown under your address. Leave it blank and the line is left out.
            </p>
          </div>

          {/* --------------------------------------------- for your website */}
          <TechnicalDetails
            title="For your website"
            hint="A Book a repair button for your website, and whether search engines may list your page."
          >
            <label className="flex items-center justify-between gap-6">
              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold text-foreground">
                  Let Google and other search engines list this page
                </span>
                <span className="text-[14px] leading-relaxed text-muted-foreground">
                  Leave it off until the page says what you want it to say.
                </span>
              </span>
              <Switch
                checked={draft.indexable}
                onCheckedChange={(indexable) => edit({ indexable })}
                words
                aria-label="Search engines may list the shop link"
              />
            </label>

            <WebsiteSnippet
              snippet={snippet}
              slug={config.slug}
              appUrl={config.appUrl}
              previewUrl={`${config.shopUrl}?embed=1`}
              enabled={draft.enabled && saved.enabled}
            />
          </TechnicalDetails>
        </CardContent>
      </Card>

      <ConnectionsCard config={config} />

      <SaveBar state={state} onSave={save} onDiscard={() => setDraft(saved)} message={problem} label="Save shop link" />
    </>
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
      toast.success("Copied. Send it to whoever looks after your website.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the line and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[15px] font-semibold">A &ldquo;Book a repair&rdquo; button on your website</span>

      <p className="text-[14px] leading-relaxed text-muted-foreground">
        Copy the code and send it to whoever looks after your website. It adds a
        &ldquo;Book a repair&rdquo; button to the corner of every page.
      </p>

      <div>
        <Button variant="outline" className="h-12 px-4" onClick={copy}>
          {copied ? <ACTIONS.save aria-hidden /> : <ACTIONS.copy aria-hidden />}
          {copied ? "Copied" : "Copy the website code"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-hover px-4 py-3">
        <span className="text-[13px] font-semibold text-muted-foreground">
          For your web person: paste this line just before the closing{" "}
          <code className="rounded-sm bg-surface px-1 py-0.5 font-mono text-[13px] text-foreground">&lt;/body&gt;</code>{" "}
          tag of the site.
        </span>
        <code className="block overflow-x-auto whitespace-pre rounded-md bg-surface px-3 py-2.5 font-mono text-[14px] text-foreground">
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
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[14px] text-muted-foreground">
            Switch your shop link on and save to see what customers will see.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex min-h-12 w-fit items-center text-[15px] font-semibold text-accent hover:underline"
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
          : "Not set up yet",
      href: "/settings?tab=payments",
      cta: payments.connected ? "Payment settings" : payments.live ? "Connect in one click" : "See what's needed",
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
      body: "Repair updates, invoices and review requests go out under your shop's name.",
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
            ? "Emails go out, texts do not yet"
            : messaging.smsLive
              ? "Texts go out, emails do not yet"
              : "Nothing is being sent yet",
      href: "/settings?tab=messaging",
      cta: "Emails & texts",
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
          ? "Last send failed"
          : accounting.connected > 0
            ? `${accounting.connected} connected`
            : accounting.configured
              ? "Not set up"
              : "Not set up yet",
      href: "/settings?tab=integrations",
      cta: accounting.connected > 0 ? "Accounting settings" : accounting.configured ? "Connect your books" : "See what's needed",
      disabled: !accounting.configured && accounting.connected === 0,
    },
    {
      icon: ICONS.apiKey,
      title: "Another program (for your web developer)",
      body: "Only if your web developer connects another program, like a website form or a booking tool.",
      status: developer.keyCount > 0 ? "connected" : "off",
      statusText:
        developer.keyCount === 0
          ? "None connected"
          : `${developer.keyCount} connected` +
            (developer.webhookCount > 0
              ? `, ${developer.webhookCount} sending updates`
              : ""),
      href: "/settings?tab=api-keys",
      cta: "Developer access",
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={ACTIONS.connect}
        title="Everything else you can connect"
        description="One row each, with whether it is working and one button. Each button opens the screen that looks after it."
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
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
      <Button
        variant={status === "off" && !disabled ? "default" : "outline"}
        className="h-12 px-4"
        asChild
      >
        <Link href={href}>
          {cta} <ACTIONS.next />
        </Link>
      </Button>
    </li>
  );
}

