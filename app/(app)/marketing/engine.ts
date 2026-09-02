/**
 * The marketing automation engine.
 *
 * A plain server module — NOT "use server". Nothing here is callable from the
 * browser; app/(app)/marketing/actions.ts wraps each entry point with
 * `requireUser()` and passes the session's shopId in. That split keeps the
 * shopId a server-supplied value: it can never arrive over the wire.
 *
 * TWO PHASES, DELIBERATELY SEPARATE
 * ---------------------------------
 *   syncCampaignSends()   looks at what has already happened in the shop and
 *                         writes one `scheduled` row per (campaign, event).
 *   runDueCampaignSends() takes the rows whose date has arrived and hands them
 *                         to lib/comms.
 *
 * Splitting them means a shop can see exactly what is queued *before* anything
 * leaves the building — the whole queue is inspectable on the campaign detail
 * page, with a date against every name.
 *
 * Both phases run unattended: lib/jobs/index.ts calls them per shop on every
 * scheduler pass (the in-app timer, /api/cron, or the "Run now" button). The
 * "Sync & send due now" button on the campaign screen calls the same two
 * functions — it is a shortcut past the wait, not the only way they run.
 */

import { db } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/comms";
import {
  addDays,
  asChannel,
  asTrigger,
  renderMessage,
  type CampaignTrigger,
} from "@/components/marketing/meta";

// ---------------------------------------------------------------------------
// Window constants — the two rules that stop a new campaign blasting history
// ---------------------------------------------------------------------------

/**
 * How far back sync will look for qualifying events. A shop switching on its
 * first campaign has years of resolved tickets sitting in the database; six
 * months is roughly "still a current customer", and it bounds the scan.
 */
export const LOOKBACK_DAYS = 180;

/**
 * How stale a computed send date may be and still go out.
 *
 * Enabling a 14-day follow-up today should reach the customer whose ticket
 * closed last week — not the one who closed in March. Anything whose
 * `scheduledAt` already sits more than this many days in the past is written
 * as `skipped: too old`: recorded, visible, and never sent.
 */
export const MAX_BACKFILL_DAYS = 30;

/** Ceiling on one manual run, so a first sync cannot tie up a request forever. */
export const MAX_SENDS_PER_RUN = 200;

/**
 * Transient claim written before a message is handed to a provider, so two
 * concurrent runs cannot both send the same row (see claim() below).
 * Every claim is resolved to a terminal status in the same pass.
 */
const CLAIMED = "sending";

const SKIPPED_TOO_OLD = "skipped: too old";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type SyncSummary = {
  /** Rows written as `scheduled`. */
  scheduled: number;
  /** Rows written as `skipped: too old`. */
  skipped: number;
};

export type RunSummary = {
  sent: number;
  skipped: number;
  failed: number;
  /** The first failure/skip reason, for the toast. */
  firstProblem: string | null;
};

const EMPTY_SYNC: SyncSummary = { scheduled: 0, skipped: 0 };

// ---------------------------------------------------------------------------
// Phase 1 — sync
// ---------------------------------------------------------------------------

type PendingSend = {
  customerId: string;
  ticketId: string | null;
  invoiceId: string | null;
  eventAt: Date;
};

/**
 * Writes the queue for every active campaign in the shop.
 *
 * DEDUPE RULE: one send per (campaign, source event). It is enforced here in
 * code rather than by a unique index, because the "event" is a different column
 * per trigger (ticketId / invoiceId / customerId) and two of the three are
 * nullable — a partial unique index per trigger would be three constraints
 * guarding one rule. Instead each campaign's existing send rows are read once
 * and the events they already cover are filtered out, so re-running sync is a
 * no-op. Sends that were skipped or sent still count as covered: a campaign
 * must never get a second bite at the same event.
 */
export async function syncCampaignSends(
  shopId: string,
  campaignId?: string,
): Promise<SyncSummary> {
  const campaigns = await db.campaign.findMany({
    where: { shopId, active: true, ...(campaignId ? { id: campaignId } : {}) },
    select: { id: true, trigger: true, delayDays: true },
  });
  if (campaigns.length === 0) return EMPTY_SYNC;

  const now = new Date();
  const windowStart = addDays(now, -LOOKBACK_DAYS);
  const tooOldBefore = addDays(now, -MAX_BACKFILL_DAYS);

  // The three event sets are the same for every campaign on the same trigger,
  // so they are read once and shared rather than re-queried per campaign.
  const triggers = new Set(campaigns.map((c) => asTrigger(c.trigger)));
  const events = await loadEvents(shopId, triggers, windowStart);

  let scheduled = 0;
  let skipped = 0;

  for (const campaign of campaigns) {
    const trigger = asTrigger(campaign.trigger);
    const covered = await coveredEventIds(campaign.id, trigger);

    const rows = events[trigger]
      .filter((event) => !covered.has(eventKey(trigger, event)))
      .map((event) => {
        const scheduledAt = addDays(event.eventAt, campaign.delayDays);
        const tooOld = scheduledAt.getTime() < tooOldBefore.getTime();
        if (tooOld) skipped += 1;
        else scheduled += 1;
        return {
          shopId,
          campaignId: campaign.id,
          customerId: event.customerId,
          ticketId: event.ticketId,
          invoiceId: event.invoiceId,
          scheduledAt,
          status: tooOld ? SKIPPED_TOO_OLD : "scheduled",
        };
      });

    if (rows.length > 0) await db.campaignSend.createMany({ data: rows });
  }

  return { scheduled, skipped };
}

/** The id that identifies "the event this row was made for", per trigger. */
function eventKey(trigger: CampaignTrigger, event: PendingSend): string {
  if (trigger === "TICKET_RESOLVED") return event.ticketId ?? "";
  if (trigger === "INVOICE_PAID") return event.invoiceId ?? "";
  return event.customerId;
}

/** Every event id this campaign has already produced a row for. */
async function coveredEventIds(
  campaignId: string,
  trigger: CampaignTrigger,
): Promise<Set<string>> {
  const rows = await db.campaignSend.findMany({
    where: { campaignId },
    select: { ticketId: true, invoiceId: true, customerId: true },
  });
  const key =
    trigger === "TICKET_RESOLVED"
      ? (r: (typeof rows)[number]) => r.ticketId
      : trigger === "INVOICE_PAID"
        ? (r: (typeof rows)[number]) => r.invoiceId
        : (r: (typeof rows)[number]) => r.customerId;

  const set = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (value) set.add(value);
  }
  return set;
}

/**
 * The qualifying events inside the lookback window, one list per trigger.
 * Only the triggers actually in use are queried.
 */
async function loadEvents(
  shopId: string,
  triggers: Set<CampaignTrigger>,
  windowStart: Date,
): Promise<Record<CampaignTrigger, PendingSend[]>> {
  const result: Record<CampaignTrigger, PendingSend[]> = {
    TICKET_RESOLVED: [],
    INVOICE_PAID: [],
    CUSTOMER_CREATED: [],
  };

  if (triggers.has("TICKET_RESOLVED")) {
    const tickets = await db.ticket.findMany({
      // `gte` on a nullable column also excludes the nulls — an unresolved
      // ticket has no event date and cannot qualify.
      where: { shopId, resolvedAt: { gte: windowStart } },
      select: { id: true, customerId: true, resolvedAt: true },
    });
    result.TICKET_RESOLVED = tickets.map((t) => ({
      customerId: t.customerId,
      ticketId: t.id,
      invoiceId: null,
      eventAt: t.resolvedAt as Date,
    }));
  }

  if (triggers.has("INVOICE_PAID")) {
    const invoices = await db.invoice.findMany({
      where: { shopId, status: "PAID", paidAt: { gte: windowStart } },
      select: { id: true, customerId: true, paidAt: true },
    });
    result.INVOICE_PAID = invoices.map((i) => ({
      customerId: i.customerId,
      ticketId: null,
      invoiceId: i.id,
      eventAt: i.paidAt as Date,
    }));
  }

  if (triggers.has("CUSTOMER_CREATED")) {
    const customers = await db.customer.findMany({
      where: { shopId, createdAt: { gte: windowStart } },
      select: { id: true, createdAt: true },
    });
    result.CUSTOMER_CREATED = customers.map((c) => ({
      customerId: c.id,
      ticketId: null,
      invoiceId: null,
      eventAt: c.createdAt,
    }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 2 — send
// ---------------------------------------------------------------------------

/**
 * Sends every scheduled message whose date has arrived.
 *
 * Each row is claimed with a compare-and-set before the provider is called, so
 * a second run (another tab, a future cron overlapping a button press) finds
 * nothing to claim rather than sending twice. The outcome lib/comms reports is
 * mirrored straight onto the row, which is what makes the sends table and the
 * customer's communication log tell the same story — lib/comms owns the
 * CommunicationLog write, this function never touches it.
 */
export async function runDueCampaignSends(
  shopId: string,
  campaignId?: string,
): Promise<RunSummary> {
  const due = await db.campaignSend.findMany({
    where: {
      shopId,
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      ...(campaignId ? { campaignId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take: MAX_SENDS_PER_RUN,
    include: {
      campaign: {
        select: { channel: true, subject: true, body: true, active: true, name: true },
      },
      customer: { select: { firstName: true } },
      ticket: { select: { number: true } },
      invoice: { select: { number: true } },
    },
  });
  if (due.length === 0) {
    return { sent: 0, skipped: 0, failed: 0, firstProblem: null };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });
  const shopName = shop?.name ?? "";

  const summary: RunSummary = { sent: 0, skipped: 0, failed: 0, firstProblem: null };

  for (const send of due) {
    // A campaign paused between sync and run should stop, not drain its queue.
    if (!send.campaign.active) continue;
    if (!(await claim(send.id, shopId))) continue;

    const vars = {
      firstName: send.customer.firstName,
      shopName,
      ticketNumber: send.ticket?.number ?? null,
      invoiceNumber: send.invoice?.number ?? null,
    };
    const body = renderMessage(send.campaign.body, vars);
    const context = send.ticket
      ? `Ticket #${send.ticket.number}`
      : send.invoice
        ? `Invoice #${send.invoice.number}`
        : null;

    const status = await deliver({
      shopId,
      customerId: send.customerId,
      ticketId: send.ticketId,
      invoiceId: send.invoiceId,
      channel: asChannel(send.campaign.channel),
      subject: renderMessage(send.campaign.subject || send.campaign.name, vars),
      body,
      context,
    });

    const delivered = status === "sent";
    await db.campaignSend.update({
      where: { id: send.id },
      data: { status, sentAt: delivered ? new Date() : null },
    });

    if (delivered) summary.sent += 1;
    else if (status.startsWith("skipped")) summary.skipped += 1;
    else summary.failed += 1;
    if (!delivered && !summary.firstProblem) summary.firstProblem = status;
  }

  return summary;
}

/**
 * Compare-and-set claim. `updateMany` with the status in its WHERE clause is a
 * single atomic statement: exactly one caller can move a row out of
 * `scheduled`, and everyone else gets count 0 and moves on.
 */
async function claim(id: string, shopId: string): Promise<boolean> {
  const claimed = await db.campaignSend.updateMany({
    where: { id, shopId, status: "scheduled" },
    data: { status: CLAIMED },
  });
  return claimed.count === 1;
}

/**
 * Hands one message to lib/comms and normalises the answer to the four words
 * `CampaignSend.status` speaks.
 *
 * "logged" (the console driver used in development) counts as sent: the message
 * was handed to the configured provider and the outbox row exists. Anything
 * else — an opt-out, a missing address, a provider error — arrives already
 * phrased as "skipped: …" / "failed: …" and is stored verbatim, reason intact.
 */
async function deliver(input: {
  shopId: string;
  customerId: string;
  ticketId: string | null;
  invoiceId: string | null;
  channel: "EMAIL" | "SMS";
  subject: string;
  body: string;
  context: string | null;
}): Promise<string> {
  try {
    const result =
      input.channel === "SMS"
        ? await sendSms({
            shopId: input.shopId,
            customerId: input.customerId,
            ticketId: input.ticketId,
            invoiceId: input.invoiceId,
            body: input.body,
            context: input.context,
          })
        : await sendEmail({
            shopId: input.shopId,
            customerId: input.customerId,
            ticketId: input.ticketId,
            invoiceId: input.invoiceId,
            subject: input.subject,
            body: input.body,
            context: input.context,
          });

    if (result.status === "logged" || result.status === "sent") return "sent";
    return result.status;
  } catch (error) {
    // lib/comms is documented never to throw for a delivery problem, so this is
    // the database or a bug — either way the row must not stay claimed.
    const message = error instanceof Error ? error.message : "unknown error";
    return `failed: ${message.replace(/\s+/g, " ").trim().slice(0, 180)}`;
  }
}

// ---------------------------------------------------------------------------
// Counters for the page headers
// ---------------------------------------------------------------------------

/** Scheduled messages whose date has arrived — the "N due" in the header. */
export function countDueSends(shopId: string, campaignId?: string): Promise<number> {
  return db.campaignSend.count({
    where: {
      shopId,
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      ...(campaignId ? { campaignId } : {}),
      campaign: { active: true },
    },
  });
}
