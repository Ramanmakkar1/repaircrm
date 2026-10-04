import Link from "next/link";
import { Mail, MessageSquare, Megaphone, Send, Timer } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import {
  IconVisual,
  MetaChip,
  RecordCard,
  RecordGrid,
} from "@/components/ui/record-card";
import { CampaignActiveStrip } from "./campaign-controls";
import { campaignCardParts, type CampaignFact } from "./card-meta";

export type CampaignCardRow = {
  id: string;
  name: string;
  trigger: string;
  delayDays: number;
  channel: string;
  active: boolean;
};

const FACT_ICON: Record<CampaignFact["key"], typeof Mail> = {
  channel: Mail,
  sent: Send,
  queued: Timer,
};

/**
 * The Easy-mode campaign list: one big card each, in place of the dense table.
 *
 *   [ megaphone ]  Campaign name .......................... [ Live ]
 *                  After ticket resolved · 14 days later
 *                  (Email) (12 sent) (3 queued)
 *   Sending on its own ................................. ( on/off )
 *
 * The whole card opens the campaign. The on/off switch sits in a strip under
 * it rather than inside it (a switch inside a link is a switch you cannot press
 * without also navigating), the whole strip is the 56px tap target, and the
 * Live / Paused word is on the card, so the state is never colour alone.
 */
export function CampaignCards({
  rows,
  stats,
}: {
  rows: CampaignCardRow[];
  stats: Map<string, { scheduled: number; sent: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
            className="py-8"
          icon={ICONS.marketing}
          title="Nothing in this view"
          hint="Every campaign is on one of the other tabs."
          action={
            <Button variant="outline" asChild>
              <Link href="/marketing">Show all campaigns</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <RecordGrid>
      {rows.map((campaign) => {
        const parts = campaignCardParts(
          campaign,
          stats.get(campaign.id) ?? { scheduled: 0, sent: 0 },
        );
        const channelIcon = campaign.channel === "SMS" ? MessageSquare : Mail;

        const statusPill = (
          <StatusPill
            tone={campaign.active ? "success" : "neutral"}
            label={parts.statusLabel}
          />
        );

        return (
          <li key={campaign.id} className="flex flex-col gap-2">
            <RecordCard
              href={`/marketing/${campaign.id}`}
              className={cn(!campaign.active && "text-muted-foreground")}
              visual={<IconVisual icon={Megaphone} />}
              title={campaign.name}
              subtitle={parts.subtitle}
              // Top right from the tablet up; on a phone it moves into the row
              // of facts so the campaign's name keeps the width.
              status={<span className="hidden sm:block">{statusPill}</span>}
              meta={
                <>
                  <span className="sm:hidden">{statusPill}</span>
                  {parts.facts.map((fact) => (
                    <MetaChip
                      key={fact.key}
                      icon={fact.key === "channel" ? channelIcon : FACT_ICON[fact.key]}
                    >
                      {fact.text}
                    </MetaChip>
                  ))}
                </>
              }
            />
            <CampaignActiveStrip
              campaignId={campaign.id}
              active={campaign.active}
              campaignName={campaign.name}
            />
          </li>
        );
      })}
    </RecordGrid>
  );
}
