/**
 * What an Easy-mode campaign card says, worked out in one place.
 *
 * Pure (no React, no `db`, no `next/*`) so the words can be tested without
 * rendering a card. The card itself is `campaign-cards.tsx`.
 */

import {
  TRIGGER_LABEL,
  asChannel,
  asTrigger,
  delayLabel,
} from "./meta";

export type CampaignFact = {
  key: "channel" | "sent" | "queued";
  text: string;
};

export type CampaignCardParts = {
  /** "After ticket resolved · 14 days later" - when it goes out. */
  subtitle: string;
  /** Channel, how many went out, how many are waiting. Three at most. */
  facts: CampaignFact[];
  statusLabel: "Live" | "Paused";
};

export function campaignCardParts(
  campaign: {
    trigger: unknown;
    delayDays: number;
    channel: unknown;
    active: boolean;
  },
  counts: { scheduled: number; sent: number },
): CampaignCardParts {
  return {
    subtitle: `${TRIGGER_LABEL[asTrigger(campaign.trigger)]} · ${delayLabel(campaign.delayDays)}`,
    facts: [
      {
        key: "channel",
        text: asChannel(campaign.channel) === "SMS" ? "Text" : "Email",
      },
      { key: "sent", text: `${counts.sent} sent` },
      { key: "queued", text: `${counts.scheduled} queued` },
    ],
    statusLabel: campaign.active ? "Live" : "Paused",
  };
}
