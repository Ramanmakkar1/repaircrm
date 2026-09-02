import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { readAuditPage } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { emailDriverName, smsDriverName, appUrl } from "@/lib/comms";
import { db } from "@/lib/db";
import {
  checkAppAddress,
  connectConfigured,
  connectStatus,
  currencySupported,
  listReaders,
  payoutSummary,
  paymentsCurrency,
  paymentsDriverName,
  paymentsLive,
  readTerminalLocationId,
  stripeClientId,
  stripeSecretKey,
  stripeTestMode,
  stripeWebhookSecret,
  webhookSetupStatus,
  webhookReady,
  WEBHOOK_EVENTS,
} from "@/lib/payments";
import { readAutomation, recentRuns } from "@/lib/jobs";
import { readInboundEmail } from "@/app/api/inbound/_lib/shop";
import { loadIntegrationCards } from "@/lib/integrations/cards";
import { ICONS } from "@/components/ui/icons";
import { googleConfigured } from "@/lib/google/config";
import { googleNotice } from "@/lib/google/messages";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { AutomationConfig } from "@/components/settings/automation-tab";
import type { CheckinTabConfig } from "@/components/settings/checkin-tab";
import {
  readCheckinSettings,
  readReviewSettings,
} from "@/components/settings/checkin-meta";
import { readPublicHub } from "@/components/settings/hub-meta";
import type { ConnectConfig } from "@/components/settings/connect-tab";
import type { IntegrationsConfig } from "@/components/settings/integrations-tab";
import type {
  MessagingConfig,
  PaymentsTabConfig,
} from "@/components/settings/types";
import type { ProfileValues } from "@/components/settings/profile-types";
import { problemTypes, ticketStatuses } from "@/components/tickets/ticket-meta";
import { readSla } from "@/lib/sla";
import { parseTemplateItems } from "@/lib/checklist";
import { readLabourSettings } from "@/lib/labour";

export const metadata = { title: "Settings · RepairFlow" };

/**
 * Everything a shop can configure, in one place.
 *
 * All the data is loaded here, on the server, and handed to the client tab
 * shell as plain props — including the messaging config, which is read from
 * `process.env` where it belongs. Only *whether* each variable is populated
 * crosses to the browser; never its value.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const isOwner = session.role === "OWNER";

  const [
    shop,
    cannedResponses,
    members,
    apiKeys,
    taxRates,
    checklists,
    locations,
    profile,
    auditPage,
    webhooks,
    deliveries,
    shopCount,
    reviewsSentThisMonth,
    integrationCards,
  ] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.shopId },
      select: {
        name: true,
        slug: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        timezone: true,
        taxRateBps: true,
        settings: true,
        // Read-only here: Stripe Connect onboarding lives in the Payments
        // settings; the Integrations hub only reports whether it happened.
        stripeAccountId: true,
      },
    }),
    db.cannedResponse.findMany({
      where: { shopId: session.shopId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, body: true },
    }),
    // The roster is owner-only; skip the query entirely for everyone else
    // rather than loading colleagues' details and hiding them client-side.
    isOwner
      ? db.user.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            createdAt: true,
            defaultLocationId: true,
            lastLoginAt: true,
            totpEnabledAt: true,
            googleSub: true,
          },
        })
      : Promise.resolve([]),
    // Same reasoning as the roster: API keys are owner-only, so a technician's
    // request never loads them at all. No plaintext key exists to load — only
    // the prefix and the hash — but the *existence* of an integration is still
    // the owner's business.
    isOwner
      ? db.apiKey.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            prefix: true,
            active: true,
            lastUsedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Named tax rates are an owner concern, like the rate they refine.
    isOwner
      ? db.taxRate.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            rateBps: true,
            isDefault: true,
            active: true,
          },
        })
      : Promise.resolve([]),
    // Checklists and branches are owner-only screens, so a technician's
    // request never loads them at all.
    isOwner
      ? db.checklistTemplate.findMany({
          where: { shopId: session.shopId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, problemType: true, items: true },
        })
      : Promise.resolve([]),
    isOwner
      ? db.location.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            address1: true,
            address2: true,
            city: true,
            state: true,
            postalCode: true,
            phone: true,
            isDefault: true,
            active: true,
          },
        })
      : Promise.resolve([]),
    // My profile is the one tab every role gets, so this always runs — and
    // only ever for the session's own user id.
    db.user.findFirst({
      where: { id: session.userId, shopId: session.shopId },
      select: {
        name: true,
        email: true,
        role: true,
        totpEnabledAt: true,
        totpRecoveryCodes: true,
        lastLoginAt: true,
        googleEmail: true,
        googleLinkedAt: true,
        avatarUrl: true,
        hasPassword: true,
      },
    }),
    // The audit log is owner-only; a technician's request never reads it.
    isOwner
      ? readAuditPage(session.shopId)
      : Promise.resolve({ rows: [], nextCursor: null }),
    // Same reasoning again: a webhook is a standing instruction to send this
    // shop's data somewhere, so only an owner ever loads them.
    isOwner
      ? db.webhook.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            url: true,
            events: true,
            active: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // The last 20 attempts across every endpoint — enough to answer "did that
    // go through?" without turning the settings page into a log viewer.
    isOwner
      ? db.webhookDelivery.findMany({
          where: { shopId: session.shopId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            webhookId: true,
            event: true,
            status: true,
            attempts: true,
            responseCode: true,
            lastError: true,
            createdAt: true,
            lastAttemptAt: true,
          },
        })
      : Promise.resolve([]),
    // Whether the single-shop inbound fallback applies — see
    // app/api/inbound/_lib/shop.ts.
    db.shop.count(),
    // "Sent this month" on the Reviews card. Counted off the tickets themselves
    // — `reviewRequestedAt` is the stamp lib/jobs/reviews.ts writes.
    isOwner
      ? db.ticket.count({
          where: {
            shopId: session.shopId,
            reviewRequestedAt: { gte: startOfMonth() },
          },
        })
      : Promise.resolve(0),
    // Same owner-only reasoning again: a technician's request never loads the
    // shop's accounting connections.
    isOwner ? loadIntegrationCards(session.shopId) : Promise.resolve([]),
  ]);

  if (!shop) notFound();
  if (!profile) notFound();

  const profileValues: ProfileValues = {
    name: profile.name,
    email: profile.email,
    role: profile.role,
    totpEnabledAt: profile.totpEnabledAt
      ? profile.totpEnabledAt.toISOString()
      : null,
    recoveryCodesLeft: profile.totpRecoveryCodes.length,
    lastLoginAt: profile.lastLoginAt ? profile.lastLoginAt.toISOString() : null,
    // Only *whether* the Google client credentials are populated crosses to the
    // browser — the same rule the messaging and payments configs follow.
    googleAvailable: googleConfigured(),
    googleEmail: profile.googleEmail,
    googleLinkedAt: profile.googleLinkedAt
      ? profile.googleLinkedAt.toISOString()
      : null,
    avatarUrl: profile.avatarUrl,
    hasPassword: profile.hasPassword,
    googleNotice: googleNotice(
      typeof params.google === "string" ? params.google : null,
    ),
  };

  // "Staff based here" needs each member's current branch, by name.
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));

  const labour = readLabourSettings(shop.settings);

  const messaging: MessagingConfig = {
    emailDriver: emailDriverName(),
    smsDriver: smsDriverName(),
    appUrl: appUrl(),
    emailVars: [
      { name: "RESEND_API_KEY", set: Boolean(process.env.RESEND_API_KEY?.trim()) },
      { name: "EMAIL_FROM", set: Boolean(process.env.EMAIL_FROM?.trim()) },
    ],
    smsVars: [
      {
        name: "TWILIO_ACCOUNT_SID",
        set: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
      },
      {
        name: "TWILIO_AUTH_TOKEN",
        set: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
      },
      { name: "TWILIO_FROM", set: Boolean(process.env.TWILIO_FROM?.trim()) },
    ],
    // How replies come back in. Only whether each secret is populated crosses
    // to the browser, never a value — same rule as the drivers above.
    inbound: {
      inboundEmail: readInboundEmail(shop.settings),
      emailUrl: `${appUrl()}/api/inbound/email`,
      smsUrl: `${appUrl()}/api/inbound/sms`,
      resendSecretSet: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      inboundTokenSet: Boolean(process.env.INBOUND_SECRET?.trim()),
      twilioTokenSet: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
      twilioFrom: process.env.TWILIO_FROM?.trim() || null,
      singleShop: shopCount <= 1,
      canEdit: isOwner,
    },
  };

  // ------------------------------------------------------------- payments
  // Card payments follow the same rule as the messaging drivers: env decides,
  // the screen only reports. Presence of each secret crosses to the browser,
  // never its value — a leaked Stripe secret key is the whole account.
  //
  // The live Stripe calls (account status, reader list) run only for an owner,
  // and only when a key exists: a technician's settings page must not spend a
  // round trip on data they will never be shown.
  const paymentsEnv = {
    driver: paymentsDriverName(),
    live: paymentsLive(),
    webhookReady: webhookReady(),
    currency: paymentsCurrency(),
    currencySupported: currencySupported(paymentsCurrency()),
    webhookUrl: `${appUrl()}/api/webhooks/stripe`,
    vars: [
      { name: "STRIPE_SECRET_KEY", set: Boolean(stripeSecretKey()) },
      { name: "STRIPE_CLIENT_ID", set: Boolean(stripeClientId()) },
      { name: "STRIPE_WEBHOOK_SECRET", set: Boolean(stripeWebhookSecret()) },
      {
        name: "PAYMENTS_CURRENCY",
        set: Boolean(process.env.PAYMENTS_CURRENCY?.trim()),
      },
    ],
  };

  const shouldQueryStripe = isOwner && paymentsLive();
  const [connection, readers, setup, payout] = await Promise.all([
    shouldQueryStripe ? connectStatus(session.shopId) : Promise.resolve(null),
    shouldQueryStripe ? listReaders(session.shopId) : Promise.resolve(null),
    isOwner ? webhookSetupStatus(session.shopId) : Promise.resolve(null),
    shouldQueryStripe
      ? payoutSummary({ shopId: session.shopId, testMode: stripeTestMode() })
      : Promise.resolve(null),
  ]);

  const payments: PaymentsTabConfig = {
    env: paymentsEnv,
    connectConfigured: connectConfigured(),
    connected: connection?.connected ?? false,
    accountId: connection?.accountId ?? null,
    onboardedAt: connection?.onboardedAt ?? null,
    testMode: connection?.testMode ?? false,
    currency: connection?.currency ?? paymentsCurrency(),
    account: connection?.account ?? null,
    accountError: connection?.accountError ?? null,
    readers: readers?.ok ? readers.readers : [],
    readersError: readers && !readers.ok ? readers.reason : null,
    hasReaderLocation: Boolean(readTerminalLocationId(shop.settings)),
    // A card can only be saved when the whole online path works — the setup
    // page is a Checkout Session and the card arrives on a confirmation from
    // Stripe, which a connected shop now gets from its own endpoint.
    cardOnFileReady:
      paymentsLive() && (webhookReady() || (setup?.automatic ?? false)),
    setup: setup ?? {
      automatic: false,
      endpointId: null,
      url: null,
      setUpAt: null,
      error: null,
      addressChanged: false,
    },
    address: checkAppAddress(),
    payout: payout ?? {
      scheduleText:
        "Connect a Stripe account to see when your money reaches the bank.",
      bankText: null,
      available: [],
      pending: [],
      dashboardUrl: "https://dashboard.stripe.com/balance",
      error: null,
    },
    // A practice machine is software: only offered while the server is on test
    // keys, and labelled as practice everywhere it appears.
    canPairPractice: stripeTestMode() && paymentsLive(),
    confirmationEvents: [...WEBHOOK_EVENTS],
  };

  // Scheduler state. Like the messaging config above, this is read from
  // `process.env` on the server and only the *shape* of it crosses to the
  // browser — whether CRON_SECRET is populated, never what it says.
  const stored = readAutomation(shop.settings);
  const automation: AutomationConfig = {
    intervalMin: envNumber(process.env.JOBS_INTERVAL_MIN, 15),
    firstDelayS: envNumber(process.env.JOBS_FIRST_DELAY_S, 60),
    cronSecretSet: Boolean(process.env.CRON_SECRET?.trim()),
    cronUrl: `${appUrl()}/api/cron`,
    lastRunAt: stored.lastRunAt ?? null,
    lastSummary: stored.lastSummary ?? null,
    // In-memory, so this is empty on a freshly restarted server — which is
    // exactly why the stored `lastSummary` above exists alongside it.
    recentRuns: isOwner ? recentRuns() : [],
    canRun: isOwner,
  };

  // The public check-in link, its kiosk variant, and a QR of the first — the QR
  // is rendered to a data URL HERE so no QR library ever reaches the browser
  // for an image that only changes when the shop's slug does.
  const checkinUrl = `${appUrl()}/checkin/${shop.slug}`;
  const kioskUrl = `${checkinUrl}?kiosk=1`;
  const checkin: CheckinTabConfig = {
    checkin: readCheckinSettings(shop.settings),
    reviews: readReviewSettings(shop.settings),
    checkinUrl,
    kioskUrl,
    qrDataUrl: isOwner
      ? await QRCode.toDataURL(checkinUrl, { margin: 1, width: 320 })
      : "",
    reviewsSentThisMonth,
  };

  const integrations: IntegrationsConfig = {
    cards: integrationCards,
    stripeConnected: Boolean(shop.stripeAccountId),
    stripeLive: paymentsLive(),
    emailDriver: emailDriverName(),
    smsDriver: smsDriverName(),
    apiKeyCount: apiKeys.filter((key) => key.active).length,
    appUrl: appUrl(),
    notice: integrationNotice(params),
  };

  // ------------------------------------------------------------- connect
  // The front door. Every status on it is DERIVED from the same live data the
  // owning tab reads — never from a stored "we think this is connected" flag —
  // so a Stripe account that was disconnected in another tab, or an email
  // driver that was switched off in the environment, shows up here on the next
  // refresh without anything having to remember to update it.
  const hub = readPublicHub(shop.settings);
  const shopUrl = `${appUrl()}/s/${shop.slug}`;
  const connect: ConnectConfig = {
    hub,
    slug: shop.slug,
    shopUrl,
    qrDataUrl: isOwner
      ? await QRCode.toDataURL(shopUrl, { margin: 1, width: 320 })
      : "",
    appUrl: appUrl(),
    checkinEnabled: checkin.checkin.enabled,
    payments: {
      connected: payments.connected,
      live: payments.env.live,
      // Connected is not the same as able to take money: Stripe holds charges
      // until identity checks clear, and "Connected" alone would leave an owner
      // wondering why their customers see declines.
      incomplete: payments.connected && payments.account?.chargesEnabled === false,
    },
    readers: {
      count: payments.readers.length,
      online: payments.readers.filter((reader) => reader.status === "online").length,
    },
    messaging: {
      emailLive: messaging.emailDriver !== "log",
      smsLive: messaging.smsDriver !== "log",
    },
    accounting: {
      connected: integrationCards.filter((card) => card.status === "connected").length,
      error: integrationCards.filter((card) => card.status === "error").length,
      configured: integrationCards.some((card) => card.configured),
    },
    developer: {
      keyCount: apiKeys.filter((key) => key.active).length,
      webhookCount: webhooks.filter((hook) => hook.active).length,
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ICONS.settings}
        title="Settings"
        description="Your shop, your team, how you get paid, and everything RepairFlow connects to."
      />

      <SettingsTabs
        role={session.role}
        currentUserId={session.userId}
        activeTab={typeof params.tab === "string" ? params.tab : ""}
        shop={{
          name: shop.name,
          address1: shop.address1 ?? "",
          address2: shop.address2 ?? "",
          city: shop.city ?? "",
          state: shop.state ?? "",
          postalCode: shop.postalCode ?? "",
          country: shop.country,
          phone: shop.phone ?? "",
          email: shop.email ?? "",
          timezone: shop.timezone,
          taxRateBps: shop.taxRateBps,
          labourRateCents: labour.rateCents,
          labourRoundingMinutes: labour.roundingMinutes,
        }}
        taxRates={taxRates}
        // The *effective* lists — the shop's own when it has configured them,
        // the built-in defaults otherwise. Editing therefore starts from what
        // the ticket pickers are actually showing today.
        problemTypes={problemTypes(shop.settings)}
        ticketStatuses={ticketStatuses(shop.settings)}
        cannedResponses={cannedResponses}
        profile={profileValues}
        auditPage={auditPage}
        members={members.map((member) => ({
          ...member,
          createdAt: member.createdAt.toISOString(),
          lastLoginAt: member.lastLoginAt
            ? member.lastLoginAt.toISOString()
            : null,
          twoFactorOn: member.totpEnabledAt !== null,
          googleLinked: member.googleSub !== null,
        }))}
        messaging={messaging}
        payments={payments}
        automation={automation}
        sla={readSla(shop.settings)}
        checklists={checklists.map((template) => ({
          id: template.id,
          name: template.name,
          problemType: template.problemType,
          items: parseTemplateItems(template.items),
        }))}
        locations={locations}
        locationStaff={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          defaultLocationId: member.defaultLocationId,
          defaultLocationName: member.defaultLocationId
            ? (locationNames.get(member.defaultLocationId) ?? null)
            : null,
        }))}
        checkin={checkin}
        apiKeys={apiKeys.map((key) => ({
          ...key,
          lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
          createdAt: key.createdAt.toISOString(),
        }))}
        webhooks={webhooks.map((hook) => ({
          ...hook,
          createdAt: hook.createdAt.toISOString(),
        }))}
        webhookDeliveries={deliveries.map((delivery) => ({
          ...delivery,
          createdAt: delivery.createdAt.toISOString(),
          lastAttemptAt: delivery.lastAttemptAt
            ? delivery.lastAttemptAt.toISOString()
            : null,
        }))}
        integrations={integrations}
        connect={connect}
      />
    </div>
  );
}

/**
 * Reads a numeric env var, falling back when it is absent or not a number.
 * Mirrors the parsing in instrumentation.ts so the screen reports what the
 * timer will actually do, not what the raw string says.
 */
/** First instant of the current calendar month, in the server's own zone. */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function envNumber(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * One line about the OAuth round trip that just came back.
 *
 * The connect and callback routes can only speak through the query string —
 * they redirect from a provider's domain, with no session state of their own
 * to carry a message in — so this turns their codes into something an operator
 * can read. `detail` is the provider's own words, already truncated at source.
 */
function integrationNotice(
  params: Record<string, string | string[] | undefined>,
): IntegrationsConfig["notice"] {
  const one = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const connected = one("connected");
  if (connected) {
    return {
      tone: "ok",
      text:
        connected === "xero"
          ? "Xero connected. Press Sync now, or leave it to the automation timer."
          : "QuickBooks Online connected. Press Sync now, or leave it to the automation timer.",
    };
  }

  const error = one("error");
  if (!error) return null;

  const detail = one("detail");
  const text: Record<string, string> = {
    cancelled: "Connection cancelled — nothing was changed.",
    "owner-only": "Only an owner can connect an accounting account.",
    "not-configured":
      "That integration is not configured on this server. The card below lists the environment variables it needs.",
    "bad-callback":
      "That sign-in link had expired or was incomplete. Start the connection again.",
    "no-tenant":
      "That Xero login does not reach any organisation. Pick a different login, or add the organisation in Xero first.",
    "connect-failed": detail || "The provider refused the connection.",
  };

  return { tone: "bad", text: text[error] ?? "Something went wrong connecting." };
}
