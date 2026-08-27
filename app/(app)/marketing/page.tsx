import Link from "next/link";
import {
  CalendarPlus,
  Clock,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Zap,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/components/billing/format";
import { CampaignActiveSwitch, SyncAndSendButton } from "@/components/marketing/campaign-controls";
import {
  TemplateGallery,
  TemplateRow,
} from "@/components/marketing/template-gallery";
import {
  TRIGGER_LABEL,
  asChannel,
  asTrigger,
  delayLabel,
  sendBucket,
} from "@/components/marketing/meta";
import { countDueSends } from "./engine";

export const metadata = { title: "Marketing · RepairFlow" };

export default async function MarketingPage() {
  const { shopId } = await requireUser();

  const [campaigns, sendCounts, dueCount] = await Promise.all([
    db.campaign.findMany({
      where: { shopId },
      // Live campaigns first, then newest — a paused one is reference material.
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        trigger: true,
        delayDays: true,
        channel: true,
        active: true,
        createdAt: true,
      },
    }),
    // One grouped read for every campaign's counts, rather than N per card.
    db.campaignSend.groupBy({
      by: ["campaignId", "status"],
      where: { shopId },
      _count: { _all: true },
    }),
    countDueSends(shopId),
  ]);

  const stats = new Map<string, { scheduled: number; sent: number }>();
  for (const row of sendCounts) {
    const bucket = sendBucket(row.status);
    const current = stats.get(row.campaignId) ?? { scheduled: 0, sent: 0 };
    if (bucket === "scheduled" || bucket === "sending") {
      current.scheduled += row._count._all;
    } else if (bucket === "sent") {
      current.sent += row._count._all;
    }
    stats.set(row.campaignId, current);
  }

  const enabledNames = campaigns.map((c) => c.name);
  const empty = campaigns.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description={
          empty
            ? "Follow-ups that send themselves — pick one below and it starts working today."
            : "Follow-ups that send themselves, so a finished repair keeps earning."
        }
        actions={
          <>
            {!empty ? <SyncAndSendButton dueCount={dueCount} /> : null}
            <Button variant={empty ? "default" : "outline"} asChild>
              <Link href="/marketing/new">
                <Plus /> New campaign
              </Link>
            </Button>
          </>
        }
      />

      {empty ? (
        <div className="flex flex-col gap-4">
          <TemplateGallery enabledNames={enabledNames} />
          <p className="px-1 text-[13.5px] leading-relaxed text-muted-foreground">
            Switching one on queues the customers who already qualify — from the
            last 30 days, so nobody hears from you about a repair they have long
            forgotten. Nothing leaves until you press{" "}
            <span className="font-semibold text-foreground">
              Sync &amp; send due now
            </span>
            .
          </p>
        </div>
      ) : (
        <>
          <TemplateRow enabledNames={enabledNames} />

          {dueCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-status-waiting/40 bg-status-waiting-bg px-5 py-3.5">
              <Send className="size-4 text-status-waiting-fg" />
              <span className="text-[14.5px] font-semibold text-status-waiting-fg">
                {dueCount} message{dueCount === 1 ? "" : "s"} due to go out.
              </span>
              <span className="text-[13.5px] text-status-waiting-fg/80">
                Sending is manual for now — a scheduled job is future work.
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((campaign) => {
              const trigger = asTrigger(campaign.trigger);
              const channel = asChannel(campaign.channel);
              const counts = stats.get(campaign.id) ?? { scheduled: 0, sent: 0 };

              return (
                <div
                  key={campaign.id}
                  className={cn(
                    "rf-lift flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm hover:shadow-md",
                    !campaign.active && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/marketing/${campaign.id}`}
                      className="min-w-0 rounded-sm text-lg font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {campaign.name}
                    </Link>
                    <CampaignActiveSwitch
                      campaignId={campaign.id}
                      active={campaign.active}
                      campaignName={campaign.name}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Chip icon={Zap}>{TRIGGER_LABEL[trigger]}</Chip>
                    <Chip icon={Clock}>{delayLabel(campaign.delayDays)}</Chip>
                    <Chip icon={channel === "SMS" ? MessageSquare : Mail}>
                      {channel === "SMS" ? "Text" : "Email"}
                    </Chip>
                  </div>

                  <div className="flex items-end gap-6">
                    <Stat label="Queued" value={counts.scheduled} />
                    <Stat label="Sent" value={counts.sent} />
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <Chip icon={CalendarPlus}>
                      Added {formatDate(campaign.createdAt)}
                    </Chip>
                    {!campaign.active ? (
                      <Chip className="bg-surface-hover font-bold">Paused</Chip>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The big-number pair every card in RepairFlow leads its metrics with. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
        {value}
      </span>
    </div>
  );
}
