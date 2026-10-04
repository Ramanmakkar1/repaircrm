import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Clock } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { formatIn } from "@/lib/dashboard/zone";
import { readUiPrefs } from "@/lib/prefs";
import { StatusPill } from "@/components/ui/badge";
import { InitialsVisual, PhotoVisual } from "@/components/ui/record-card";
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
  CampaignMoreMenu,
  SyncCampaignButton,
} from "@/components/marketing/campaign-controls";
import { MessagePreview } from "@/components/marketing/campaign-flow";
import { SendStatusChip } from "@/components/marketing/send-status-chip";
import {
  CHANNEL_LABEL,
  SEND_STATUS_META,
  TRIGGER_HINT,
  TRIGGER_LABEL,
  TRIGGER_WORDS,
  asChannel,
  asTrigger,
  delayLabel,
  previewVars,
  renderMessage,
  sendBucket,
  waitWords,
  type SendBucket,
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
    title: campaign ? `${campaign.name} · Repairs helper` : "Campaign · Repairs helper",
  };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, { simple }, zone] = await Promise.all([params, readUiPrefs(), loadShopZone(shopId)]);

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

  if (simple) {
    // Easy mode: what it is, ONE big button (Pause / Turn on), what the
    // customer gets, three numbers in words, and the latest people it went to.
    // The long explanation and the full message log wait below, folded.
    const recent = campaign.sends.slice(0, 8);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <PhotoVisual src="/images/home/megaphone.webp" className="size-20 sm:size-24" />
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{campaign.name}</h1>
              <StatusPill tone={campaign.active ? "success" : "neutral"} label={campaign.active ? "Live" : "Paused"} />
              <p className="text-base text-muted-foreground">
                {TRIGGER_WORDS[trigger]} · {waitWords(campaign.delayDays).toLowerCase()} · {channel === "SMS" ? "Text message" : "Email"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 [&>*:first-child]:flex-1 sm:[&>*:first-child]:flex-none">
            <CampaignActiveButton campaignId={campaign.id} active={campaign.active} campaignName={campaign.name} big />
            <CampaignMoreMenu
              campaignId={campaign.id}
              campaignName={campaign.name}
              active={campaign.active}
              canDelete={role === "OWNER"}
              sendCount={campaign._count.sends}
            />
          </div>
        </section>

        <ul className="grid grid-cols-3 gap-3" aria-label="How it is going">
          <EasyStat label="Waiting to go" value={tally.scheduled} />
          <EasyStat label="Sent" value={tally.sent} />
          <EasyStat label="Did not send" value={tally.skipped + tally.failed} />
        </ul>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="gets-title" className="flex flex-col gap-2">
            <h2 id="gets-title" className="text-lg font-semibold">What the customer gets</h2>
            <MessagePreview sms={channel === "SMS"} subject={previewSubject} body={previewBody} />
          </section>

          <section aria-labelledby="recent-title" className="flex flex-col gap-2">
            <h2 id="recent-title" className="text-lg font-semibold">Latest customers</h2>
            {recent.length === 0 ? (
              <p className="rounded-2xl border border-border bg-surface px-4 py-5 text-base text-muted-foreground">
                {campaign.active
                  ? "Nobody yet. It goes to customers as they qualify; More, then Send what is due now, looks back over the last few weeks."
                  : "Nobody yet. Turn it on and it starts with the customers who qualify."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((send) => {
                  const name = customerLabel(send.customer);
                  const bucket = sendBucket(send.status);
                  return (
                    <li key={send.id}>
                      <Link
                        href={`/customers/${send.customer.id}`}
                        data-touch-control
                        className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <InitialsVisual name={name} className="size-11 text-base sm:size-11 sm:text-base" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-semibold">{name}</span>
                          <span className="text-sm text-muted-foreground">
                            {send.sentAt
                              ? `Sent ${formatIn(send.sentAt.getTime(), zone, { month: "short", day: "numeric" })}`
                              : `Goes ${formatIn(send.scheduledAt.getTime(), zone, { month: "short", day: "numeric" })}`}
                          </span>
                        </span>
                        <StatusPill tone={SEND_STATUS_META[bucket].tone} label={SEND_WORDS[bucket]} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <details className="group/how rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
            How it works, and every message
            <span className="text-[15px] text-accent-soft-foreground">
              <span className="group-open/how:hidden">Show</span>
              <span className="hidden group-open/how:inline">Hide</span>
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-border p-4">
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {TRIGGER_HINT[trigger]} Customers who said no to {channel === "SMS" ? "texts" : "email"}, or who have no{" "}
              {channel === "SMS" ? "mobile number" : "email address"} on file, are left out, and the reason is written down. Anything more
              than {MAX_BACKFILL_DAYS} days late is left out rather than sent late.
            </p>
            {campaign.sends.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {campaign.sends.map((send) => (
                  <li key={send.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/customers/${send.customer.id}`} className="font-semibold hover:underline">
                      {customerLabel(send.customer)}
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {formatIn((send.sentAt ?? send.scheduledAt).getTime(), zone, { month: "short", day: "numeric", year: "numeric" })}
                      <SendStatusChip status={send.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {campaign._count.sends > SEND_LIMIT ? (
              <p className="text-sm text-muted-foreground">
                The {SEND_LIMIT} most recent of {campaign._count.sends} messages.
              </p>
            ) : null}
          </div>
        </details>
      </div>
    );
  }

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
                  label={campaign.active ? "Live" : "Paused"}
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
            <Chip icon={CalendarPlus}>Added {formatDate(campaign.createdAt, zone)}</Chip>
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
                        {formatDate(send.scheduledAt, zone)}
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {send.sentAt ? formatDateTime(send.sentAt, zone) : "—"}
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

/** The send outcomes in Easy words. */
const SEND_WORDS: Record<SendBucket, string> = {
  scheduled: "Waiting",
  sending: "Sending",
  sent: "Sent",
  skipped: "Not sent",
  failed: "Failed",
};

function EasyStat({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
      <span className="rf-num text-3xl font-semibold leading-none">{value}</span>
      <span className="text-[15px] text-muted-foreground">{label}</span>
    </li>
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
