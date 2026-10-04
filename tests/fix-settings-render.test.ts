import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * First paint of the Settings screens rewritten for shop owners: what an owner
 * sees first is what a thing does, whether it is on (in words) and one next
 * step; variable names, web addresses and code sit inside the closed
 * "Technical details" fold; links are buttons; switches say On / Off; edit and
 * delete say so; and every panel with fields has one pinned Save.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));
const stub = vi.hoisted(() => (names: string[]) =>
  Object.fromEntries(names.map((name) => [name, () => undefined])),
);
vi.mock("@/app/(app)/settings/actions", () =>
  stub([
    "deleteCannedResponseAction",
    "inviteUserAction",
    "resendInviteAction",
    "resetUserTotpAction",
    "saveCannedResponseAction",
    "saveIntakeOptionsAction",
    "setUserActiveAction",
    "updateCheckinAction",
    "updatePublicHubAction",
    "updateReviewsAction",
    "updateShopAction",
    "updateUserRoleAction",
    "updateWorkflowAction",
  ]),
);
vi.mock("@/app/(app)/settings/api-key-actions", () => stub(["createApiKeyAction", "setApiKeyActiveAction"]));
vi.mock("@/app/(app)/settings/audit-actions", () => stub(["loadAuditPageAction"]));
vi.mock("@/app/(app)/settings/automation-actions", () => stub(["runJobsNowAction"]));
vi.mock("@/app/(app)/settings/inbound-actions", () => stub(["saveInboundEmailAction"]));
vi.mock("@/app/(app)/settings/integration-actions", () =>
  stub(["chooseXeroTenantAction", "disconnectIntegrationAction", "saveXeroAccountCodesAction", "syncNowAction"]),
);
vi.mock("@/app/(app)/settings/tax-actions", () => stub(["deleteTaxRateAction", "saveTaxRateAction"]));
vi.mock("@/app/(app)/settings/webhook-actions", () =>
  stub(["createWebhookAction", "deleteWebhookAction", "retryWebhookDeliveryAction", "sendTestWebhookAction", "setWebhookActiveAction"]),
);
vi.mock("@/app/(app)/setup/actions", () =>
  stub(["advanceOnboardingAction", "createStarterItemsAction", "finishOnboardingAction", "inviteTeamAction", "saveShopBasicsAction", "setOnboardingStepAction"]),
);

const { MessagingTab } = await import("@/components/settings/messaging-tab");
const { AutomationTab } = await import("@/components/settings/automation-tab");
const { IntegrationsTab } = await import("@/components/settings/integrations-tab");
const { ApiKeysTab } = await import("@/components/settings/api-keys-tab");
const { CheckinTab } = await import("@/components/settings/checkin-tab");
const { ConnectTab } = await import("@/components/settings/connect-tab");
const { TeamTab } = await import("@/components/settings/team-tab");
const { CannedTab } = await import("@/components/settings/canned-tab");
const { ShopTab } = await import("@/components/settings/shop-tab");
const { AuditTab } = await import("@/components/settings/audit-tab");
const { Switch } = await import("@/components/settings/settings-switch");
const { ShopZoneProvider } = await import("@/components/settings/shop-zone");
const { OnboardingWizard } = await import("@/components/onboarding/wizard");
const { DEFAULT_CHECKIN_SETTINGS, DEFAULT_REVIEW_SETTINGS } = await import("@/components/settings/checkin-meta");
const { DEFAULT_PUBLIC_HUB_SETTINGS } = await import("@/components/settings/hub-meta");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const h = React.createElement as (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => React.ReactElement;
/** Renders inside the shop's time zone (America/Edmonton), as the settings shell does. */
const inZone = (child: React.ReactElement) => h(ShopZoneProvider, { zone: "America/Edmonton" }, child);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The markup before / inside the closed Technical details fold. */
const split = (markup: string) => {
  const at = markup.indexOf("data-technical-details");
  return at < 0 ? { owner: markup, technical: "" } : { owner: markup.slice(0, at), technical: markup.slice(at) };
};
const ENV_NAME = /\b[A-Z][A-Z0-9]+_[A-Z0-9_]{2,}\b/;
/** The words written beside each switch, in order. */
const switchWords = (markup: string) => [...markup.matchAll(/data-switch-word=""[^>]*>([^<]*)</g)].map((match) => match[1]);

describe("Emails & texts: an owner's answer first, the wiring for the installer", () => {
  const config = {
    emailDriver: "log",
    smsDriver: "log",
    appUrl: "http://localhost:3020",
    emailVars: [{ name: "RESEND_API_KEY", set: false }, { name: "EMAIL_FROM", set: false }],
    smsVars: [{ name: "TWILIO_ACCOUNT_SID", set: false }],
    inbound: {
      inboundEmail: "",
      emailUrl: "http://localhost:3020/api/inbound/email",
      smsUrl: "http://localhost:3020/api/inbound/sms",
      resendSecretSet: false,
      inboundTokenSet: false,
      twilioTokenSet: false,
      twilioFrom: null,
      singleShop: true,
      canEdit: true,
    },
  };

  it("says Not sending yet in words, with the next step, and no variable names", () => {
    const markup = html(h(MessagingTab, { config }));
    const { owner, technical } = split(markup);
    expect(text(owner)).toContain("Emails to customers");
    expect(text(owner)).toContain("Not sending yet");
    expect(text(owner)).toContain("Ask your installer to connect an email service");
    expect(text(owner)).toContain("Your reply address");
    expect(owner).not.toMatch(ENV_NAME);
    expect(owner).not.toContain("/api/inbound");
    expect(owner).not.toContain("Log mode");
    // Still there for the installer, folded away (a closed <details>).
    expect(technical).toContain("RESEND_API_KEY");
    expect(technical).toContain("/api/inbound/email");
    expect(markup).toMatch(/<details[^>]*data-technical-details/);
    expect(markup).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("tells staff to ask the owner, and gives them no address box", () => {
    const { owner } = split(html(h(MessagingTab, { config: { ...config, inbound: { ...config.inbound, canEdit: false } } })));
    expect(text(owner)).toContain("Ask your shop owner");
    expect(owner).not.toContain("inbound-email");
  });
});

describe("Reminders & follow-ups", () => {
  it("leads with Running and one Run now button; the timer variables are folded away", () => {
    const markup = html(
      inZone(
        h(AutomationTab, {
          config: { intervalMin: 15, firstDelayS: 60, cronSecretSet: false, cronUrl: "http://localhost:3020/api/cron", lastRunAt: "2026-10-04T03:30:00.000Z", lastSummary: null, recentRuns: [], canRun: true },
        }),
      ),
    );
    const { owner, technical } = split(markup);
    expect(text(owner)).toContain("Reminders and follow-ups");
    expect(text(owner)).toContain("Running");
    expect(text(owner)).toContain("Run now");
    // The last run, on the shop's clock (9:30 PM the night before, in Edmonton).
    expect(text(owner)).toContain("Oct 3, 2026, 9:30 PM");
    expect(owner).not.toMatch(ENV_NAME);
    expect(owner).not.toContain("/api/cron");
    expect(technical).toContain("JOBS_INTERVAL_MIN");
    expect(technical).toContain("CRON_SECRET");
  });
});

describe("Accounting", () => {
  it("says Not set up yet and Ask your installer; the variables and the redirect address are folded away", () => {
    const card = {
      provider: "quickbooks" as const,
      label: "QuickBooks Online",
      configured: false,
      envVars: [{ name: "QBO_CLIENT_ID", set: false }, { name: "QBO_CLIENT_SECRET", set: false }],
      redirectUri: "http://localhost:3020/api/integrations/quickbooks/callback",
      status: "none" as const,
      tenantName: null,
      lastSyncAt: null,
      lastError: null,
      lastSummary: null,
      linked: { customer: 0, product: 0, invoice: 0, payment: 0 },
      salesAccountCode: "",
      bankAccountCode: "",
      tenantChoices: [],
    };
    const markup = html(
      inZone(
        h(IntegrationsTab, {
          config: { cards: [card], stripeConnected: false, stripeLive: false, emailDriver: "log", smsDriver: "log", apiKeyCount: 0, appUrl: "http://localhost:3020", notice: null },
        }),
      ),
    );
    const { owner, technical } = split(markup);
    expect(text(owner)).toContain("Not set up yet");
    expect(text(owner)).toContain("ask your installer to connect QuickBooks Online");
    expect(owner).not.toMatch(ENV_NAME);
    expect(owner).not.toContain("/callback");
    expect(text(owner)).not.toContain("Sync");
    expect(technical).toContain("QBO_CLIENT_ID");
    expect(technical).toContain("/api/integrations/quickbooks/callback");
  });
});

describe("Developer access", () => {
  it("explains it is only for a web developer, the key switch says On, and curl is folded away", () => {
    const markup = html(
      inZone(
        h(ApiKeysTab, {
          keys: [{ id: "k1", name: "Website form", prefix: "ab12cd34", active: true, lastUsedAt: null, createdAt: "2026-09-30T12:00:00.000Z" }],
          appUrl: "http://localhost:3020",
          webhooks: [],
          deliveries: [],
        }),
      ),
    );
    const { owner, technical } = split(markup);
    expect(text(owner)).toContain("If nobody has asked you for a key, you can leave this alone.");
    expect(switchWords(owner)).toEqual(["On"]);
    expect(owner).not.toContain("curl");
    expect(technical).toContain("curl");
    expect(technical).toContain("Webhooks");
  });
});

describe("Check-in & reviews", () => {
  const config = {
    checkin: { ...DEFAULT_CHECKIN_SETTINGS, enabled: true },
    reviews: { ...DEFAULT_REVIEW_SETTINGS, enabled: true, url: "https://g.page/r/demo/review" },
    checkinUrl: "http://localhost:3020/checkin/demo",
    kioskUrl: "http://localhost:3020/checkin/demo?kiosk=1",
    qrDataUrl: "data:image/png;base64,AAAA",
    reviewsSentThisMonth: 2,
    shopName: "Demo Repair Shop",
  };

  it("gives the link as buttons, not a raw address to copy by hand", () => {
    const markup = html(h(CheckinTab, { config }));
    for (const button of ["Copy link", "Show QR code", "Print sign", "Open page"]) expect(text(markup)).toContain(button);
    expect(markup).not.toContain('value="http://localhost:3020/checkin/demo"');
    expect(markup).not.toContain("font-mono");
    expect(text(markup)).not.toContain("404");
  });

  it("shows the review message the customer will get, with the blanks filled", () => {
    const markup = text(html(h(CheckinTab, { config })));
    expect(markup).toContain("Hi Sam, thanks for choosing Demo Repair Shop! If we did right by you, a quick review would mean a lot: https://g.page/r/demo/review");
    expect(markup).toContain("Next day");
  });

  it("has one Save, pinned, for both cards, and switches that say On", () => {
    const markup = html(h(CheckinTab, { config }));
    expect(markup.match(/data-save-bar=""/g)).toHaveLength(1);
    expect(text(markup)).not.toContain("Save check-in");
    expect(text(markup)).not.toContain("Save reviews");
    expect(switchWords(markup)).toEqual(["On", "On"]);
  });
});

describe("Shop link", () => {
  const config = {
    hub: { ...DEFAULT_PUBLIC_HUB_SETTINGS },
    slug: "demo",
    shopUrl: "http://localhost:3020/s/demo",
    qrDataUrl: "data:image/png;base64,AAAA",
    appUrl: "http://localhost:3020",
    checkinEnabled: true,
    payments: { connected: false, live: false, incomplete: false },
    readers: { count: 0, online: 0 },
    messaging: { emailLive: false, smsLive: false },
    accounting: { connected: 0, error: 0, configured: false },
    developer: { keyCount: 0, webhookCount: 0 },
  };

  it("is buttons (Copy link, Show QR code, Print sign) and Off in words", () => {
    const { owner } = split(html(h(ConnectTab, { config })));
    for (const button of ["Copy link", "Show QR code", "Print sign"]) expect(text(owner)).toContain(button);
    expect(switchWords(owner)[0]).toBe("Off");
    expect(switchWords(owner)).toHaveLength(5); // the link, then each thing on the page
    expect(text(owner)).not.toContain("404");
    expect(owner).not.toContain("&lt;/body&gt;");
    expect(owner).not.toContain("font-mono");
  });

  it("folds the website code into For your website, and has one pinned Save", () => {
    const markup = html(h(ConnectTab, { config }));
    const { technical } = split(markup);
    expect(technical).toContain("&lt;/body&gt;");
    expect(text(technical)).toContain("Copy the website code");
    expect(markup.match(/data-save-bar=""/g)).toHaveLength(1);
  });

  it("never says 'Not available on this server', and gives a next step", () => {
    const markup = text(html(h(ConnectTab, { config })));
    expect(markup).not.toContain("Not available on this server");
    expect(markup).toContain("See what's needed");
  });
});

describe("Team", () => {
  const members = [
    { id: "u1", name: "Dana Ortiz", email: "dana@example.com", role: "OWNER", active: true, createdAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "2026-10-03T12:00:00.000Z", twoFactorOn: false, googleLinked: false },
    { id: "u2", name: "Sam Lee", email: "sam@example.com", role: "TECH", active: false, createdAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null, twoFactorOn: false, googleLinked: false },
  ];

  it("Easy mode: a card per person, role and sign-in in words, one Manage button, no table", () => {
    const markup = html(h(TeamTab, { members, currentUserId: "u1", simple: true }));
    expect(markup).not.toContain("<table");
    expect(text(markup)).toContain("Add someone");
    expect(markup.match(/>Manage</g)).toHaveLength(2);
    expect(text(markup)).toContain("Owner");
    expect(text(markup)).toContain("Can sign in");
    expect(text(markup)).toContain("Switched off");
    expect(text(markup)).toContain("You");
  });

  it("Full mode: the table, a sign-in word on every row, no greyed switch for yourself, no blank Access cell", () => {
    const markup = html(h(TeamTab, { members, currentUserId: "u1" }));
    expect(markup).toContain("<table");
    // Your own row says it in words; nobody else's switch is locked.
    expect(markup.match(/role="switch"/g)).toHaveLength(1);
    expect(switchWords(markup)).toEqual(["Switched off"]);
    expect(text(markup)).toContain("Can sign in");
    expect(text(markup)).toContain("Nothing to do");
    expect(text(markup)).toContain("Resend invite");
  });
});

describe("Saved replies", () => {
  it("is called Saved replies, shows the message as a bubble with an Edit word, and no icon-only delete", () => {
    const markup = html(h(CannedTab, { responses: [{ id: "c1", title: "Parts arrived", body: "Good news: your part is in." }], canManage: true }));
    expect(text(markup)).toContain("New saved reply");
    expect(text(markup)).toContain("Edit");
    expect(text(markup)).not.toContain("canned");
    expect(markup).not.toContain("Delete Parts arrived");
    expect(text(markup)).toContain("Good news: your part is in.");
  });
});

describe("Shop details", () => {
  it("has one pinned Save after the tax rates (never between cards), a picked time zone and Edit / Delete words", () => {
    const markup = html(
      h(ShopTab, {
        shop: { name: "Demo", address1: "", address2: "", city: "", state: "", postalCode: "", country: "US", phone: "", email: "", timezone: "America/Edmonton", taxRateBps: 825, labourRateCents: 9500, labourRoundingMinutes: 15 },
        taxRates: [{ id: "t1", name: "GST", rateBps: 500, isDefault: true, active: true }],
      }),
    );
    expect(markup.match(/data-save-bar=""/g)).toHaveLength(1);
    expect(markup.indexOf("Named tax rates")).toBeLessThan(markup.indexOf("data-save-bar"));
    expect(markup.indexOf("Labour")).toBeLessThan(markup.indexOf("data-save-bar"));
    expect(markup).toMatch(/<select[^>]*name="timezone"/);
    expect(markup).toContain('<option value="America/Edmonton" selected="">Mountain (Edmonton, Calgary)</option>');
    expect(text(markup)).not.toContain("IANA");
    expect(markup).toContain('aria-label="Edit GST"');
    expect(markup).toMatch(/aria-label="Delete GST"[^>]*>[\s\S]*?Delete<\/button>/);
    expect(markup).toContain('form="shop-details-form"');
  });
});

describe("Activity history", () => {
  it("groups by the shop's day, says who in initials and words, and uses plain filter names", () => {
    const markup = html(
      inZone(
        h(AuditTab, {
          initial: {
            rows: [
              { id: "a1", action: "ticket.deleted", entity: "ticket", entityId: null, summary: "Deleted repair #1004", meta: null, ip: null, createdAt: new Date().toISOString(), actorName: "Dana Ortiz" },
            ],
            nextCursor: null,
          },
          members: [],
        }),
      ),
    );
    expect(text(markup)).toContain("Today");
    expect(text(markup)).toContain("Repair deleted");
    expect(text(markup)).toContain("DO");
    expect(text(markup)).not.toContain("Ticket");
  });
});

describe("Switch words", () => {
  it("says On / Off, or the pair it is given, beside the switch", () => {
    expect(switchWords(html(h(Switch, { checked: true, words: true, "aria-label": "x" })))).toEqual(["On"]);
    expect(switchWords(html(h(Switch, { checked: false, words: true, "aria-label": "x" })))).toEqual(["Off"]);
    expect(switchWords(html(h(Switch, { checked: false, words: ["Open", "Closed"], "aria-label": "x" })))).toEqual(["Closed"]);
    expect(switchWords(html(h(Switch, { checked: true, "aria-label": "x" })))).toEqual([]);
  });

  it("keeps a locked 'on' switch at full colour (only an 'off' one fades)", () => {
    const markup = html(h(Switch, { checked: true, disabled: true, "aria-label": "x" }));
    expect(markup).toContain("disabled:data-[state=unchecked]:opacity-50");
    expect(markup).not.toContain(" disabled:opacity-50");
  });
});

describe("First-run setup", () => {
  const data = {
    initialStep: "team" as const,
    completed: ["shop" as const],
    skipped: [],
    shop: { name: "Demo", phone: "", address1: "", city: "", state: "", postalCode: "", taxRate: "" },
    teamCount: 1,
    productCount: 0,
    paymentsLive: false,
    stripeConnected: false,
    portalUrl: "http://localhost:3020/portal",
    shopUrl: "http://localhost:3020/s/demo",
    shopQr: "",
    shopLinkLive: false,
    sampleTicket: null,
  };

  it("says the step in words with a progress bar and a picture, and offers Do this later", () => {
    const markup = html(h(OnboardingWizard, { data }));
    expect(text(markup)).toContain("Step 2 of 5: Your team");
    expect(markup).toMatch(/role="progressbar"[^>]*aria-valuenow="40"/);
    expect(markup).toContain("customers-cards.webp");
    expect(text(markup)).toContain("Do this later");
    expect(text(markup)).toContain("Done");
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("ends with three picture tiles and one Start selling button, and no raw addresses", () => {
    const markup = html(h(OnboardingWizard, { data: { ...data, initialStep: "ready" } }));
    for (const tile of ["Share your link", "Print a test repair", "Open your shop"]) expect(text(markup)).toContain(tile);
    expect(text(markup)).toContain("Start selling");
    expect(markup).not.toContain("font-mono");
    expect(text(markup)).not.toContain("http://localhost:3020/portal");
  });
});
