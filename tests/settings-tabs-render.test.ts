import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The shell reads the router, and its tabs import server actions that reach the
// database. This test only reads the first paint, so neither is ever called.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));
// Named exports only: a Proxy factory is not something vitest can wrap.
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
vi.mock("@/app/(app)/settings/api-key-actions", () =>
  stub(["createApiKeyAction", "setApiKeyActiveAction"]),
);
vi.mock("@/app/(app)/settings/audit-actions", () => stub(["loadAuditPageAction"]));
vi.mock("@/app/(app)/settings/automation-actions", () => stub(["runJobsNowAction"]));
vi.mock("@/app/(app)/settings/checklist-actions", () =>
  stub(["saveChecklistTemplateAction", "setChecklistTemplateActiveAction"]),
);
vi.mock("@/app/(app)/settings/inbound-actions", () => stub(["saveInboundEmailAction"]));
vi.mock("@/app/(app)/settings/integration-actions", () =>
  stub([
    "chooseXeroTenantAction",
    "disconnectIntegrationAction",
    "saveXeroAccountCodesAction",
    "syncNowAction",
  ]),
);
vi.mock("@/app/(app)/settings/location-actions", () =>
  stub([
    "saveLocationAction",
    "setDefaultLocationAction",
    "setLocationActiveAction",
    "setLocationStaffAction",
  ]),
);
vi.mock("@/app/(app)/settings/payments-actions", () =>
  stub([
    "createSquareDeviceCodeAction",
    "disconnectSquareAction",
    "disconnectStripeAction",
    "forgetReaderAction",
    "pairPracticeReaderAction",
    "registerReaderAction",
    "renameReaderAction",
    "retryPaymentSetupAction",
    "setCardMachineAction",
    "testPaymentsAction",
  ]),
);
vi.mock("@/app/(app)/settings/profile-actions", () =>
  stub([
    "changeOwnPasswordAction",
    "confirmTotpAction",
    "disableTotpAction",
    "disconnectGoogleAction",
    "startTotpSetupAction",
    "updateProfileNameAction",
  ]),
);
vi.mock("@/app/(app)/settings/sla-actions", () => stub(["updateSlaAction"]));
vi.mock("@/app/(app)/settings/tax-actions", () =>
  stub(["deleteTaxRateAction", "saveTaxRateAction"]),
);
vi.mock("@/app/(app)/settings/webhook-actions", () =>
  stub([
    "createWebhookAction",
    "deleteWebhookAction",
    "retryWebhookDeliveryAction",
    "sendTestWebhookAction",
    "setWebhookActiveAction",
  ]),
);

const { SettingsTabs } = await import("@/components/settings/settings-tabs");

const profile = {
  name: "Dana Ortiz",
  email: "dana@example.com",
  role: "TECH",
  totpEnabledAt: null,
  recoveryCodesLeft: 0,
  lastLoginAt: null,
  googleAvailable: false,
  googleEmail: null,
  googleLinkedAt: null,
  avatarUrl: null,
  hasPassword: true,
  googleNotice: null,
};

/** Only the first paint of the active panel is rendered, so the rest can be empty. */
function render(options: { role: string; activeTab: string; simple: boolean }) {
  return renderToStaticMarkup(
    React.createElement(SettingsTabs, {
      role: options.role,
      currentUserId: "u1",
      activeTab: options.activeTab,
      simple: options.simple,
      profile,
      cannedResponses: [],
      messaging: {
        emailDriver: "log",
        smsDriver: "log",
        appUrl: "http://localhost:3000",
        emailVars: [],
        smsVars: [],
        inbound: {
          inboundEmail: null,
          emailUrl: "",
          smsUrl: "",
          resendSecretSet: false,
          inboundTokenSet: false,
          twilioTokenSet: false,
          twilioFrom: null,
          singleShop: true,
          canEdit: false,
        },
      },
      shop: {
        name: "Demo",
        address1: "",
        address2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
        phone: "",
        email: "",
        timezone: "America/Chicago",
        taxRateBps: 0,
        labourRateCents: 0,
        labourRoundingMinutes: 15,
      },
      taxRates: [],
    } as never),
  );
}

describe("SettingsTabs", () => {
  it("Easy mode: pill navigation, a one-line explanation, no side rail", () => {
    const html = render({ role: "OWNER", activeTab: "shop", simple: true });
    expect(html).toContain('aria-label="Settings areas"');
    expect(html).toContain("min-h-11");
    // The screen's own name stays for screen readers, the line says what it is for.
    expect(html).toContain('<h2 class="sr-only">Shop details</h2>');
    expect(html).toContain("Your shop&#x27;s name, address, timezone, tax rates and labour rate.");
    expect(html).not.toContain("lg:sticky");
    // The same forms are still there.
    expect(html).toContain('name="timezone"');
    expect(html).toContain("Shop identity");
  });

  it("Easy mode restyles card headers from one place and adds no side stripes", () => {
    const html = render({ role: "OWNER", activeTab: "shop", simple: true });
    expect(html).toContain("[&amp;_[data-card=header]_h3]:text-[17px]");
    expect(html).not.toMatch(/border-[lr]-/);
    expect(html).not.toContain("before:");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("Full mode keeps the compact side rail with every section in it", () => {
    const html = render({ role: "OWNER", activeTab: "shop", simple: false });
    expect(html).toContain("lg:sticky");
    expect(html).not.toContain('aria-label="Settings areas"');
    for (const label of [
      "Shop details",
      "Workflow",
      "Locations",
      "Canned responses",
      "Team",
      "My profile",
      "Payments",
      "Connect",
      "Messaging",
      "Check-in &amp; reviews",
      "Integrations",
      "API &amp; webhooks",
      "Automation",
      "Audit log",
    ]) {
      expect(html).toContain(`>${label}</button>`);
    }
    // The current row is a tint, not a coloured bar down its edge.
    expect(html).not.toContain("before:");
  });

  it("opens the section ?tab= names, and the first one for anything else", () => {
    expect(render({ role: "OWNER", activeTab: "shop", simple: true })).toContain("Shop identity");
    expect(render({ role: "OWNER", activeTab: "nonsense", simple: true })).toContain("Shop identity");
  });

  it("gives a technician three sections, My profile first, in either mode", () => {
    for (const simple of [true, false]) {
      const html = render({ role: "TECH", activeTab: "payments", simple });
      expect(html).toContain("Your details");
      for (const label of ["My profile", "Canned responses", "Messaging"]) {
        expect(html).toContain(`>${label}</button>`);
      }
      // Owner-only sections are not rendered at all.
      for (const label of ["Team", "Payments", "Audit log", "Workflow"]) {
        expect(html).not.toContain(`>${label}</button>`);
      }
    }
  });
});
