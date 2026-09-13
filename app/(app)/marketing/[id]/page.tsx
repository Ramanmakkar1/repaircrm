import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Clock } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/badge";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ConfirmActionDialog } from "@/components/billing/action-form";
import { formatDate, formatDateTime } from "@/components/billing/format";
import { customerLabel } from "@/components/billing/queries";
import {
  CampaignActiveButton,
  SyncCampaignButton,
} from "@/components/marketing/campaign-controls";
import { SendStatusChip } from "@/components/marketing/send-status-chip";
import {
  CHANNEL_LABEL,
  TRIGGER_HINT,
  TRIGGER_LABEL,
  asChannel,
  asTrigger,
  delayLabel,
  previewVars,
  renderMessage,
  sendBucket,
} from "@/components/marketing/meta";
import { LOOKBACK_DAYS, MAX_BACKFILL_DAYS } from "../engine";
import { deleteCampaignAction } from "../actions";

/** The sends table is a working queue, not an archive — newest 100 is plenty. */
const SEND_LIMIT = 100;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;
  const campaign = await db.campaign.findFirst({
    where: { id, shopId },
    select: { name: true },
  });
  return {
    title: campaign ? `${campaign.name} · RepairPilot` : "Campaign · RepairPilot",
  };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;

  const campaign = await db.campaign.findFirst({
    where: { id, shopId },
    include: {
      sends: {
        orderBy: [{ scheduledAt: "desc" }],
        take: SEND_LIMIT,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          ticket: { select: { id: true, number: true } },
          invoice: { select: { id: true, number: true } },
        },
      },
      _count: { select: { sends: true } },
    },
  });
  if (!campaign) notFound();

  const [shop, counts] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
    db.campaignSend.groupBy({
      by: ["status"],
      where: { shopId, campaignId: campaign.id },
      _count: { _all: true },
    }),
  ]);

  const tally = { scheduled: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of counts) {
    const bucket = sendBucket(row.status);
    if (bucket === "sending") tally.scheduled += row._count._all;
    else tally[bucket] += row._count._all;
  }

  const trigger = asTrigger(campaign.trigger);
  const channel = asChannel(campaign.channel);
  const shopName = shop?.name ?? "Your shop";
  const vars = previewVars(shopName);
  const previewSubject = renderMessage(campaign.subject ?? "", vars);
  const previewBody = renderMessage(campaign.body, vars);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Marketing", href: "/marketing" },
          { label: campaign.name },
        ]}
      />

      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-3xl font-bold leading-tight tracking-tight text-foreground">
                  {campaign.name}
                </span>
                <StatusPill
                  tone={campaign.active ? "success" : "neutral"}
                  label={campaign.active ? "Active" : "Paused"}
                />
              </div>
              <p className="text-[15px] leading-snug text-muted-foreground">
                {TRIGGER_LABEL[trigger]} · {delayLabel(campaign.delayDays)} ·{" "}
                {CHANNEL_LABEL[channel]}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <SyncCampaignButton campaignId={campaign.id} />
              <Button variant="outline" asChild>
                <Link href={`/marketing/${campaign.id}/edit`}>
                  <ACTIONS.edit /> Edit
                </Link>
              </Button>
              <CampaignActiveButton
                campaignId={campaign.id}
                active={campaign.active}
                campaignName={campaign.name}
              />
              {role === "OWNER" ? (
                <ConfirmActionDialog
                  action={deleteCampaignAction}
                  fields={{ id: campaign.id }}
                  triggerLabel="Delete"
                  triggerIcon={<ACTIONS.delete />}
                  title={`Delete ${campaign.name}?`}
                  description={`The campaign and its ${campaign._count.sends} send record${
                    campaign._count.sends === 1 ? "" : "s"
                  } go for good. Messages already delivered stay in each customer's communication log.`}
                  confirmLabel="Delete campaign"
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Chip icon={ICONS.automation}>{TRIGGER_LABEL[trigger]}</Chip>
            <Chip icon={Clock}>{delayLabel(campaign.delayDays)}</Chip>
            <Chip icon={channel === "SMS" ? ICONS.message : ICONS.email}>
              {CHANNEL_LABEL[channel]}
            </Chip>
            <Chip icon={CalendarPlus}>Added {formatDate(campaign.createdAt)}</Chip>
          </div>

          <div className="flex flex-wrap items-end gap-7 border-t border-border pt-4">
            <Stat label="Queued" value={tally.scheduled} />
            <Stat label="Sent" value={tally.sent} tone="resolved" />
            <Stat label="Skipped" value={tally.skipped} />
            <Stat label="Failed" value={tally.failed} tone="overdue" />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- settings */}
        <Card>
          <CardHeader icon={ICONS.automation} title="How it runs" />
          <CardContent className="flex flex-col gap-3.5">
            <Row label="Trigger" value={TRIGGER_LABEL[trigger]} />
            <Row label="Wait" value={delayLabel(campaign.delayDays)} />
            <Row label="Channel" value={CHANNEL_LABEL[channel]} />
            <p className="border-t border-border pt-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
              {TRIGGER_HINT[trigger]} Sync looks back {LOOKBACK_DAYS} days for
              qualifying events, and anything whose send date is already more
              than {MAX_BACKFILL_DAYS} days past is filed as{" "}
              <span className="font-semibold text-foreground">too old</span>{" "}
              rather than sent late.
            </p>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Customers who opted out of{" "}
              {channel === "SMS" ? "texts" : "email"}, or who have no{" "}
              {channel === "SMS" ? "mobile number" : "email address"} on file,
              are skipped with the reason recorded — they are never quietly
              dropped.
            </p>
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- preview */}
        <Card>
          <CardHeader icon={ACTIONS.view} title="What the customer gets" />
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-md border border-border bg-surface-hover/60 px-4 py-3.5">
              {channel === "EMAIL" && previewSubject ? (
                <p className="mb-2.5 border-b border-border pb-2.5 text-[15px] font-bold leading-snug text-foreground">
                  {previewSubject}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">
                {previewBody}
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Shown with sample values. Each message is rendered against the real
              customer and the ticket or invoice that triggered it, at the moment
              it goes out.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------- sends */}
      <Card>
        <CardHeader
          icon={ICONS.message}
          title="Messages"
          description={
            campaign._count.sends === 0
              ? "Everyone this campaign has queued or sent to."
              : `${campaign._count.sends} in the queue and the log, newest first.`
          }
        />
        <CardContent className="px-0 py-0">
          {campaign.sends.length === 0 ? (
            <EmptyState
              icon={ICONS.inbound}
              title="Nothing queued yet"
              hint={
                campaign.active
                  ? `Press Sync to look back over the last ${LOOKBACK_DAYS} days and queue everyone who qualifies.`
                  : "This campaign is paused. Resume it, then press Sync to queue the customers who qualify."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Customer</Th>
                    <Th className="w-[150px]">Source</Th>
                    <Th className="w-[150px]">Scheduled</Th>
                    <Th className="w-[190px]">Sent</Th>
                    <Th className="w-[210px]">Status</Th>
                  </Tr>
                </THead>
                <TBody>
                  {campaign.sends.map((send) => (
                    <Tr key={send.id}>
                      <Td>
                        <Link
                          href={`/customers/${send.customer.id}`}
                          className="font-semibold text-foreground transition-colors hover:text-accent"
                        >
                          {customerLabel(send.customer)}
                        </Link>
                      </Td>
                      <Td>
                        {send.ticket ? (
                          <Link
                            href={`/tickets/${send.ticket.id}`}
                            className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                          >
                            <ICONS.serial className="size-3.5 text-faint-foreground" />
                            {send.ticket.number}
                          </Link>
                        ) : send.invoice ? (
                          <Link
                            href={`/invoices/${send.invoice.id}`}
                            className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                          >
                            <ICONS.serial className="size-3.5 text-faint-foreground" />
                            {send.invoice.number}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <ICONS.customer className="size-3.5 text-faint-foreground" />
                            New customer
                          </span>
                        )}
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {formatDate(send.scheduledAt)}
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {send.sentAt ? formatDateTime(send.sentAt) : "—"}
                      </Td>
                      <Td>
                        <SendStatusChip status={send.status} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {campaign._count.sends > SEND_LIMIT ? (
            <p className="border-t border-border px-5 py-3 text-[13.5px] text-muted-foreground">
              Showing the {SEND_LIMIT} most recent of {campaign._count.sends}{" "}
              messages.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "resolved" | "overdue";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-[26px] font-bold leading-none tabular-nums tracking-tight",
          value === 0
            ? "text-faint-foreground"
            : tone === "resolved"
              ? "text-status-resolved-fg"
              : tone === "overdue"
                ? "text-status-overdue-fg"
                : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
