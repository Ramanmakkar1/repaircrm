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
import { MessagingTab } from "./messaging-tab";
import { ProfileTab } from "./profile-tab";
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
  sla,
  checklists,
  locations,
  locationStaff,
  profile,
  auditPage,
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
  /** Owner-only; response targets, checklists and the shop's branches. */
  sla: SlaHours;
  checklists: ChecklistTemplateItem[];
  locations: LocationItem[];
  locationStaff: LocationStaffMember[];
  /** The session user's own account — every role gets this one. */
  profile: ProfileValues;
  /** Owner-only; the first page of the audit trail, newest first. */
  auditPage: AuditPage;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isOwner = role === "OWNER";
  const canManageCanned = isOwner || role === "FRONT_DESK";

  const tabs = React.useMemo(
    () =>
      [
        // First for everyone who is not an owner: a technician opening Settings
        // is nearly always here to change their own password.
        isOwner ? null : { value: "profile", label: "My profile" },
        isOwner ? { value: "shop", label: "Shop" } : null,
        isOwner ? { value: "workflow", label: "Workflow" } : null,
        { value: "canned", label: "Canned responses" },
        isOwner ? { value: "locations", label: "Locations" } : null,
        isOwner ? { value: "team", label: "Team" } : null,
        { value: "messaging", label: "Messaging" },
        isOwner ? { value: "automation", label: "Automation" } : null,
        isOwner ? { value: "profile", label: "My profile" } : null,
        isOwner ? { value: "api-keys", label: "API keys" } : null,
        isOwner ? { value: "audit", label: "Audit log" } : null,
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
          <ApiKeysTab keys={apiKeys} appUrl={messaging.appUrl} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
