/**
 * What an Easy-mode campaign card says, worked out in one place.
 *
 * Pure (no React, no `db`, no `next/*`) so the words can be tested without
 * rendering a card. The card itself is `campaign-cards.tsx`.
 */

import {
  TRIGGER_WORDS,
  asChannel,
  asTrigger,
  waitWords,
} from "./meta";

export type CampaignFact = {
  key: "channel" | "sent" | "queued";
  text: string;
};

export type CampaignCardParts = {
  /** "After a repair is finished · 2 weeks later" - when it goes out, in plain words. */
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
    subtitle: `${TRIGGER_WORDS[asTrigger(campaign.trigger)]} · ${waitWords(campaign.delayDays)}`,
    facts: [
      {
        key: "channel",
        text: asChannel(campaign.channel) === "SMS" ? "Text" : "Email",
      },
      { key: "sent", text: `${counts.sent} sent` },
      { key: "queued", text: `${counts.scheduled} waiting` },
    ],
    statusLabel: campaign.active ? "Live" : "Paused",
  };
}
