"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/components/ui/cn";
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
import { SettingsPillNav } from "./settings-nav";
import {
  groupPanels,
  hasGroupLabels,
  panelsForRole,
  resolvePanel,
  tabFromHref,
} from "./settings-panels";
import { ShopTab } from "./shop-tab";
import { TeamTab } from "./team-tab";
import { WorkflowTab } from "./workflow-tab";
import type { DeviceKind } from "@/lib/intake-options";
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
  setCardMachineAction,
  testPaymentsAction,
} from "@/app/(app)/settings/payments-actions";

/**
 * Easy mode restyles every card on every panel from this one place instead of
 * from fourteen files: a bigger title and description, more room in the header
 * band, and the icon lined up with the title rather than floating mid-block.
 * It targets the `data-card` hooks `Card` exposes for exactly this, and leaves
 * card bodies alone (some hold tables that run edge to edge).
 */
const EASY_CARDS = [
  "[&_[data-card=header]]:px-5 [&_[data-card=header]]:py-4",
  "[&_[data-card=header]_h3]:text-[17px] [&_[data-card=header]_h3]:leading-snug",
  "[&_[data-card=header]_p]:text-[14px]",
  "[&_[data-card=header]>div:first-child>svg:first-child]:mt-0.5 [&_[data-card=header]>div:first-child>svg:first-child]:size-5 [&_[data-card=header]>div:first-child>svg:first-child]:self-start",
].join(" ");

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
  deviceKinds,
  problemPictures,
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
  simple,
}: {
  role: string;
  currentUserId: string;
  activeTab: string;
  /**
   * Easy mode (the default): big pill navigation and larger cards. Full mode
   * keeps the compact side rail. Same panels, same forms, either way.
   */
  simple: boolean;
  shop: ShopSettingsValues;
  /** Owner-only; empty for everyone else because the query never ran. */
  taxRates: TaxRateOption[];
  problemTypes: string[];
  /** Owner-only: the New repair device boxes. The standard list when left out. */
  deviceKinds?: readonly DeviceKind[];
  /** Owner-only: a picture chosen for a problem, by name. */
  problemPictures?: Record<string, string>;
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

  const panels = panelsForRole(role);
  const groups = React.useMemo(() => groupPanels(panels), [panels]);
  const showGroupLabels = hasGroupLabels(panels);

  const [value, setValue] = React.useState(() => resolvePanel(panels, activeTab));

  const active = panels.find((panel) => panel.value === value) ?? panels[0];

  function select(next: string) {
    setValue(next);
    // replace, not push: flipping panels should not fill the back button.
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  const root = React.useRef<HTMLDivElement>(null);

  // The panels link to each other ("Open" on the Connect panel, "Set up
  // payments" on Integrations). Those are `/settings?tab=…` links, and since
  // this component stays mounted a soft navigation would change the URL
  // without ever changing the panel. Taking the click here switches panels
  // directly: no second server render, and `value` stays the one thing that
  // decides what is on screen, so a late response can never flip it back.
  function takeTabLinks(event: React.MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = (event.target as Element).closest?.("a");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const target = tabFromHref(link.getAttribute("href"), pathname);
    if (target === null || !panels.some((panel) => panel.value === target)) return;
    event.preventDefault();
    select(target);
    root.current?.scrollIntoView({ block: "start" });
  }

  const panelContent = (
    <>
      {isOwner ? (
        <TabsContent value="shop">
          <ShopTab shop={shop} taxRates={taxRates} />
        </TabsContent>
      ) : null}

      {isOwner ? (
        <TabsContent value="workflow">
          <WorkflowTab
            problemTypes={problemTypes}
            deviceKinds={deviceKinds}
            problemPictures={problemPictures}
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
            setCardMachineAction={setCardMachineAction}
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
    </>
  );

  if (simple) {
    return (
      <Tabs
        ref={root}
        value={value}
        onValueChange={select}
        onClickCapture={takeTabLinks}
        className="flex min-w-0 flex-col gap-5"
      >
        <SettingsPillNav groups={groups} value={value} onSelect={select} />

        <div className={cn("flex min-w-0 flex-col gap-5", EASY_CARDS)}>
          {/*
            The pill above already names the screen, so the heading is for
            screen readers and the one line says what the screen is for.
          */}
          <div className="-mt-2">
            <h2 className="sr-only">{active.label}</h2>
            <p className="text-[15px] leading-snug text-muted-foreground">
              {active.blurb}
            </p>
          </div>

          <div className="min-w-0 [&>[role=tabpanel]]:mt-0">{panelContent}</div>
        </div>
      </Tabs>
    );
  }

  return (
    <Tabs
      ref={root}
      value={value}
      onValueChange={select}
      onClickCapture={takeTabLinks}
      orientation="vertical"
      className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
    >
      {/*
        Full mode keeps the compact rail: a column of quiet rows on a laptop,
        exactly like the main sidebar; a single scrollable strip on a phone,
        where a 224px column would eat half the screen. It sticks to the top of
        the scrollport on a tall window and simply scrolls with the page on a
        short one — which beats giving a fourteen-row nav a scrollbar of its own.
      */}
      <TabsList className="h-auto shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 lg:sticky lg:top-6 lg:w-52 lg:flex-col lg:items-stretch lg:gap-4 lg:overflow-x-visible">
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
                // The current row is a faint tint with accent ink and a bold
                // label; no coloured bar, so it never reads as a status stripe.
                className="h-8 shrink-0 justify-start whitespace-nowrap rounded-md px-3 text-left text-[14px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground data-[state=active]:bg-surface-hover data-[state=active]:font-semibold data-[state=active]:text-accent-soft-foreground data-[state=active]:shadow-none"
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
          <p className="text-[14px] leading-snug text-muted-foreground">
            {active.blurb}
          </p>
        </div>

        {panelContent}
      </div>
    </Tabs>
  );
}
