"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysTab } from "./api-keys-tab";
import { AutomationTab, type AutomationConfig } from "./automation-tab";
import { CannedTab } from "./canned-tab";
import { MessagingTab } from "./messaging-tab";
import { ShopTab } from "./shop-tab";
import { TeamTab } from "./team-tab";
import { WorkflowTab } from "./workflow-tab";
import type { TaxRateOption } from "@/lib/tax";
import type {
  ApiKeyItem,
  CannedResponseItem,
  MessagingConfig,
  ShopSettingsValues,
  TeamMember,
} from "./types";

/**
 * The settings shell.
 *
 * Tabs a role cannot use are not rendered at all rather than rendered disabled:
 * a technician has no business seeing the team roster or the tax rate, and an
 * empty greyed-out panel only invites them to ask why. The server actions each
 * re-check the role anyway — this is the polite half of the guard, not the
 * enforcing half.
 *
 * The active tab is mirrored into `?tab=`, so a refresh (which every save does)
 * comes back to the panel the operator was on.
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
  apiKeys,
  automation,
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
  /** Owner-only; empty for everyone else because the query never ran. */
  apiKeys: ApiKeyItem[];
  /** Owner-only; scheduler state and the last automation run. */
  automation: AutomationConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isOwner = role === "OWNER";
  const canManageCanned = isOwner || role === "FRONT_DESK";

  const tabs = React.useMemo(
    () =>
      [
        isOwner ? { value: "shop", label: "Shop" } : null,
        isOwner ? { value: "workflow", label: "Workflow" } : null,
        { value: "canned", label: "Canned responses" },
        isOwner ? { value: "team", label: "Team" } : null,
        { value: "messaging", label: "Messaging" },
        isOwner ? { value: "automation", label: "Automation" } : null,
        isOwner ? { value: "api-keys", label: "API keys" } : null,
      ].filter((tab): tab is { value: string; label: string } => tab !== null),
    [isOwner],
  );

  const initial = tabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : tabs[0].value;
  const [value, setValue] = React.useState(initial);

  function select(next: string) {
    setValue(next);
    // replace, not push: flipping tabs should not fill the back button.
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <Tabs value={value} onValueChange={select}>
      <TabsList className="flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

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
          />
        </TabsContent>
      ) : null}

      <TabsContent value="canned">
        <CannedTab responses={cannedResponses} canManage={canManageCanned} />
      </TabsContent>

      {isOwner ? (
        <TabsContent value="team">
          <TeamTab members={members} currentUserId={currentUserId} />
        </TabsContent>
      ) : null}

      <TabsContent value="messaging">
        <MessagingTab config={messaging} />
      </TabsContent>

      {isOwner ? (
        <TabsContent value="automation">
          <AutomationTab config={automation} />
        </TabsContent>
      ) : null}

      {isOwner ? (
        <TabsContent value="api-keys">
          <ApiKeysTab keys={apiKeys} appUrl={messaging.appUrl} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
