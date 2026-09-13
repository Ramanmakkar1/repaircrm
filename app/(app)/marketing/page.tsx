import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { RowLink } from "@/components/list/row-link";
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

export const metadata = { title: "Marketing · RepairPilot" };

/**
 * The saved views. Every campaign is already in memory — a shop runs a handful,
 * not a page of them — so the counts beside each tab cost nothing and the
 * filtering is a `.filter()`, not a second query.
 */
const VIEWS = ["all", "live", "paused"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  all: "All",
  live: "Live",
  paused: "Paused",
};

function asView(value: string | string[] | undefined): View {
  return (VIEWS as readonly string[]).includes(String(value)) ? (value as View) : "all";
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const view = asView((await searchParams).view);

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
    // One grouped read for every campaign's counts, rather than N per row.
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

  const counts: Record<View, number> = {
    all: campaigns.length,
    live: campaigns.filter((c) => c.active).length,
    paused: campaigns.filter((c) => !c.active).length,
  };

  const rows =
    view === "all"
      ? campaigns
      : campaigns.filter((c) => (view === "live" ? c.active : !c.active));

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
                <ACTIONS.add /> New campaign
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
            forgotten. Queued messages then send themselves — the scheduler runs
            every fifteen minutes (Settings &rarr; Automation) — or press{" "}
            <span className="font-semibold text-foreground">
              Sync &amp; send due now
            </span>{" "}
            to go immediately.
          </p>
        </div>
      ) : (
        <>
          <TemplateRow enabledNames={enabledNames} />

          {dueCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-status-waiting/40 bg-status-waiting-bg px-5 py-3.5">
              <ACTIONS.send className="size-4 text-status-waiting-fg" />
              <span className="text-[14.5px] font-semibold text-status-waiting-fg">
                {dueCount} message{dueCount === 1 ? "" : "s"} due to go out.
              </span>
              <span className="text-[13.5px] text-status-waiting-fg/80">
                These go out on their own — the scheduler picks them up within
                fifteen minutes. Press the button to send them right now.
              </span>
            </div>
          ) : null}

          <FilterTabs
            aria-label="Campaign views"
            tabs={VIEWS.map((key) => ({
              label: VIEW_LABELS[key],
              href: hrefFor(key),
              active: view === key,
              count: counts[key],
            }))}
          />

          <Card>
            <CardContent className="px-0 py-0">
              {rows.length === 0 ? (
                <EmptyState
                  icon={ICONS.marketing}
                  title="Nothing in this view"
                  hint="Every campaign is on one of the other tabs."
                  action={
                    <Button variant="outline" asChild>
                      <Link href="/marketing">Show all campaigns</Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>Campaign</Th>
                      <Th>Status</Th>
                      <Th>Trigger</Th>
                      <Th>Channel</Th>
                      <Th className="text-right">Queued</Th>
                      <Th className="text-right">Sent</Th>
                      <Th>Added</Th>
                      <Th className="text-right">Live</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {rows.map((campaign) => {
                      const trigger = asTrigger(campaign.trigger);
                      const channel = asChannel(campaign.channel);
                      const counted =
                        stats.get(campaign.id) ?? { scheduled: 0, sent: 0 };

                      return (
                        <RowLink
                          key={campaign.id}
                          href={`/marketing/${campaign.id}`}
                          className={cn(!campaign.active && "text-muted-foreground")}
                        >
                          <Td>
                            <Link
                              href={`/marketing/${campaign.id}`}
                              className="block max-w-[260px] truncate font-semibold text-foreground hover:underline"
                            >
                              {campaign.name}
                            </Link>
                          </Td>
                          <Td>
                            <StatusPill
                              tone={campaign.active ? "success" : "neutral"}
                              label={campaign.active ? "Live" : "Paused"}
                            />
                          </Td>
                          <Td className="text-muted-foreground">
                            {TRIGGER_LABEL[trigger]} · {delayLabel(campaign.delayDays)}
                          </Td>
                          <Td className="text-muted-foreground">
                            {channel === "SMS" ? "Text" : "Email"}
                          </Td>
                          <Td className="text-right text-muted-foreground">
                            {counted.scheduled}
                          </Td>
                          <Td className="text-right font-semibold text-foreground">
                            {counted.sent}
                          </Td>
                          <Td className="text-muted-foreground">
                            {formatDate(campaign.createdAt)}
                          </Td>
                          <Td className="w-px text-right">
                            <CampaignActiveSwitch
                              campaignId={campaign.id}
                              active={campaign.active}
                              campaignName={campaign.name}
                            />
                          </Td>
                        </RowLink>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A view is a URL: shareable, bookmarkable, and back-button correct. */
function hrefFor(view: View): string {
  return view === "all" ? "/marketing" : `/marketing?view=${view}`;
}
