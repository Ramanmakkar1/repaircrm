"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysTab } from "./api-keys-tab";
import { AuditTab } from "./audit-tab";
import { AutomationTab, type AutomationConfig } from "./automation-tab";
import { CannedTab } from "./canned-tab";
import {
  LocationsTab,
  type LocationItem,
  type LocationStaffMember,
} from "./locations-tab";
import { CheckinTab, type CheckinTabConfig } from "./checkin-tab";
import { ConnectTab, type ConnectConfig } from "./connect-tab";
import { IntegrationsTab, type IntegrationsConfig } from "./integrations-tab";
import { MessagingTab } from "./messaging-tab";
import { ProfileTab } from "./profile-tab";
import { PaymentsTab } from "./payments-tab";
import { ShopTab } from "./shop-tab";
import { TeamTab } from "./team-tab";
import { WorkflowTab } from "./workflow-tab";
import type { ChecklistTemplateItem } from "./checklists-card";
import type { SlaHours } from "@/lib/sla";
import type { TaxRateOption } from "@/lib/tax";
import type { AuditPage } from "./audit-types";
import type { ProfileValues } from "./profile-types";
import type {
  ApiKeyItem,
  CannedResponseItem,
  MessagingConfig,
  PaymentsTabConfig,
  ShopSettingsValues,
  TeamMember,
  WebhookDeliveryItem,
  WebhookItem,
} from "./types";
import {
  createSquareDeviceCodeAction,
  disconnectStripeAction,
  disconnectSquareAction,
  forgetReaderAction,
  pairPracticeReaderAction,
  registerReaderAction,
  renameReaderAction,
  retryPaymentSetupAction,
  testPaymentsAction,
} from "@/app/(app)/settings/payments-actions";

interface SettingsPanel {
  /** Mirrored into `?tab=` — never rename one of these, links depend on them. */
  value: string;
  label: string;
  /** The one line under the panel title. Says what this screen is *for*. */
  blurb: string;
  group: string;
}

/**
 * Owner settings, grouped the way a shop owner thinks about them rather than
 * the order the features happened to be built in. Thirteen flat tabs across
 * the top wrapped onto a second row on a laptop and read as one undifferentiated
 * wall; five short lists down the side do not.
 *
 * Order within a group is deliberate: the thing you configure first comes first.
 */
const OWNER_PANELS: SettingsPanel[] = [
  {
    value: "shop",
    label: "Shop details",
    blurb: "Your shop's name, address, timezone, tax rates and labour rate.",
    group: "Shop",
  },
  {
    value: "workflow",
    label: "Workflow",
    blurb:
      "Problem types, ticket statuses, response targets and repair checklists.",
    group: "Shop",
  },
  {
    value: "locations",
    label: "Locations",
    blurb: "The branches you work out of, and which one each person starts in.",
    group: "Shop",
  },
  {
    value: "canned",
    label: "Canned responses",
    blurb: "Saved replies your team can drop into a message to a customer.",
    group: "Shop",
  },
  {
    value: "team",
    label: "Team",
    blurb: "Who can sign in, what each of them can do, and pending invites.",
    group: "People",
  },
  {
    value: "profile",
    label: "My profile",
    blurb: "Your own name, your password and your two-factor security.",
    group: "People",
  },
  {
    value: "payments",
    label: "Payments",
    blurb:
      "Card processing, in-store terminals, and how customers pay an invoice.",
    group: "Money",
  },
  {
    // The front door: one screen an owner can work top to bottom. It leads the
    // group because "how do I connect this to my website?" is the first
    // question a new shop asks, and every row below it links to the tab that
    // actually owns that setting.
    value: "connect",
    label: "Connect",
    blurb:
      "Your one shop link, card payments, messages — everything, one button each.",
    group: "Connections",
  },
  {
    value: "messaging",
    label: "Messaging",
    blurb: "How email and text messages leave RepairPilot, and replies come back.",
    group: "Connections",
  },
  {
    value: "checkin",
    label: "Check-in & reviews",
    blurb: "Your public check-in page and the review request sent after pickup.",
    group: "Connections",
  },
  {
    value: "integrations",
    label: "Integrations",
    blurb:
      "Accounting sync, and where every other connection in RepairPilot is set up.",
    group: "Connections",
  },
  {
    // Webhooks live on this panel too, and nobody found them under "API keys".
    value: "api-keys",
    label: "API & webhooks",
    blurb: "Keys for the RepairPilot API, and where events get posted to.",
    group: "Connections",
  },
  {
    value: "automation",
    label: "Automation",
    blurb: "The background timer: what it sends, and what it did on its last run.",
    group: "System",
  },
  {
    value: "audit",
    label: "Audit log",
    blurb: "A record of who changed what in this shop, and when they did it.",
    group: "System",
  },
];

/**
 * Everyone who is not an owner. My profile leads, because a technician opening
 * Settings is nearly always here to change their own password.
 */
const STAFF_PANELS: SettingsPanel[] = ["profile", "canned", "messaging"].map(
  (value) => OWNER_PANELS.find((panel) => panel.value === value)!,
);

const GROUP_ORDER = ["Shop", "People", "Money", "Connections", "System"];

/**
 * The settings shell.
 *
 * Panels a role cannot use are not rendered at all rather than rendered
 * disabled: a technician has no business seeing the team roster or the tax
 * rate, and an empty greyed-out panel only invites them to ask why. The server
 * actions each re-check the role anyway — this is the polite half of the
 * guard, not the enforcing half.
 *
 * The active panel is mirrored into `?tab=`, so a refresh (which every save
 * does) comes back to the panel the operator was on, and every `?tab=` link
 * that ever worked still works.
 */
export function SettingsTabs({
  role,
  currentUserId,
  activeTab,
  shop,
  taxRates,
  problemTypes,
  ticketStatuses,
  cannedResponses,
  members,
  messaging,
  payments,
  apiKeys,
  webhooks,
  webhookDeliveries,
  automation,
  sla,
  checklists,
  locations,
  locationStaff,
  profile,
  auditPage,
  checkin,
  integrations,
  connect,
}: {
  role: string;
  currentUserId: string;
  activeTab: string;
  shop: ShopSettingsValues;
  /** Owner-only; empty for everyone else because the query never ran. */
  taxRates: TaxRateOption[];
  problemTypes: string[];
  ticketStatuses: string[];
  cannedResponses: CannedResponseItem[];
  members: TeamMember[];
  messaging: MessagingConfig;
  /** Owner-only; the Stripe lookups behind it never run for anyone else. */
  payments: PaymentsTabConfig;
  /** Owner-only; empty for everyone else because the query never ran. */
  apiKeys: ApiKeyItem[];
  /** Owner-only; the same reason: where this shop's data is sent. */
  webhooks: WebhookItem[];
  webhookDeliveries: WebhookDeliveryItem[];
  /** Owner-only; scheduler state and the last automation run. */
  automation: AutomationConfig;
  /** Owner-only; response targets, checklists and the shop's branches. */
  sla: SlaHours;
  checklists: ChecklistTemplateItem[];
  locations: LocationItem[];
  locationStaff: LocationStaffMember[];
  /** The session user's own account — every role gets this one. */
  profile: ProfileValues;
  /** Owner-only; the first page of the audit trail, newest first. */
  auditPage: AuditPage;
  /** Owner-only; the public check-in form and the review request. */
  checkin: CheckinTabConfig;
  /** Owner-only; accounting connections and where everything else is set up. */
  integrations: IntegrationsConfig;
  /** Owner-only; the shop's public link and the state of every connection. */
  connect: ConnectConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isOwner = role === "OWNER";
  const canManageCanned = isOwner || role === "FRONT_DESK";

  const panels = isOwner ? OWNER_PANELS : STAFF_PANELS;

  // Three links do not need five headings over them; thirteen do.
  const showGroupLabels = panels.length > 5;

  const groups = React.useMemo(
    () =>
      showGroupLabels
        ? GROUP_ORDER.map((label) => ({
            label,
            items: panels.filter((panel) => panel.group === label),
          })).filter((group) => group.items.length > 0)
        : [{ label: "", items: panels }],
    [panels, showGroupLabels],
  );

  const initial = panels.some((panel) => panel.value === activeTab)
    ? activeTab
    : panels[0].value;
  const [value, setValue] = React.useState(initial);

  const active = panels.find((panel) => panel.value === value) ?? panels[0];

  function select(next: string) {
    setValue(next);
    // replace, not push: flipping panels should not fill the back button.
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <Tabs
      value={value}
      onValueChange={select}
      orientation="vertical"
      className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
    >
      {/*
        A rail of quiet rows on a laptop, exactly like the main sidebar; a
        single scrollable strip of pills on a phone, where a 224px column would
        eat half the screen. It sticks to the top of the scrollport on a tall
        window and simply scrolls with the page on a short one — which beats
        giving a thirteen-row nav a scrollbar of its own.
      */}
      <TabsList
        className="h-auto shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 lg:sticky lg:top-6 lg:w-52 lg:flex-col lg:items-stretch lg:gap-4 lg:overflow-x-visible"
      >
        {groups.map((group) => (
          <div
            key={group.label || "all"}
            className="flex shrink-0 items-center gap-1 lg:flex-col lg:items-stretch"
          >
            {showGroupLabels ? (
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground lg:block">
                {group.label}
              </p>
            ) : null}
            {group.items.map((panel) => (
              <TabsTrigger
                key={panel.value}
                value={panel.value}
                /*
                 * Same row treatment as the main sidebar — faint tint, accent
                 * ink, and a 2px bar on the left edge — so a settings rail and
                 * the app rail read as one navigation system rather than two
                 * that happen to sit near each other.
                 */
                className="relative h-8 shrink-0 justify-start whitespace-nowrap rounded-md px-3 text-left text-[13.5px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground data-[state=active]:bg-surface-hover data-[state=active]:font-semibold data-[state=active]:text-accent-soft-foreground data-[state=active]:shadow-none lg:data-[state=active]:before:absolute lg:data-[state=active]:before:inset-y-1.5 lg:data-[state=active]:before:left-0 lg:data-[state=active]:before:w-[2px] lg:data-[state=active]:before:rounded-full lg:data-[state=active]:before:bg-accent"
              >
                {panel.label}
              </TabsTrigger>
            ))}
          </div>
        ))}
      </TabsList>

      {/* The panels sit flush with the top of the rail, so no `mt-4` here. */}
      <div className="min-w-0 flex-1 [&>[role=tabpanel]]:mt-0">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {active.label}
          </h2>
          <p className="text-[13.5px] leading-snug text-muted-foreground">
            {active.blurb}
          </p>
        </div>

        {isOwner ? (
          <TabsContent value="shop">
            <ShopTab shop={shop} taxRates={taxRates} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="workflow">
            <WorkflowTab
              problemTypes={problemTypes}
              ticketStatuses={ticketStatuses}
              sla={sla}
              checklists={checklists}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="canned">
          <CannedTab responses={cannedResponses} canManage={canManageCanned} />
        </TabsContent>

        {isOwner ? (
          <TabsContent value="locations">
            <LocationsTab locations={locations} members={locationStaff} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="team">
            <TeamTab members={members} currentUserId={currentUserId} />
          </TabsContent>
        ) : null}

        <TabsContent value="messaging">
          <MessagingTab config={messaging} />
        </TabsContent>

        {isOwner ? (
          <TabsContent value="payments">
            <PaymentsTab
              config={payments}
              disconnectAction={disconnectStripeAction}
              disconnectSquareAction={disconnectSquareAction}
              createSquareDeviceCodeAction={createSquareDeviceCodeAction}
              registerReaderAction={registerReaderAction}
              pairPracticeReaderAction={pairPracticeReaderAction}
              renameReaderAction={renameReaderAction}
              forgetReaderAction={forgetReaderAction}
              retrySetupAction={retryPaymentSetupAction}
              testPaymentsAction={testPaymentsAction}
            />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="checkin">
            <CheckinTab config={checkin} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="connect">
            <ConnectTab config={connect} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="integrations">
            <IntegrationsTab config={integrations} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="automation">
            <AutomationTab config={automation} />
          </TabsContent>
        ) : null}

        <TabsContent value="profile">
          <ProfileTab profile={profile} />
        </TabsContent>

        {isOwner ? (
          <TabsContent value="audit">
            <AuditTab initial={auditPage} members={members} />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="api-keys">
            <ApiKeysTab
              keys={apiKeys}
              appUrl={messaging.appUrl}
              webhooks={webhooks}
              deliveries={webhookDeliveries}
            />
          </TabsContent>
        ) : null}
      </div>
    </Tabs>
  );
}
