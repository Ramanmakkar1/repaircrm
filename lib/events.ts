import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";
import { WILDCARD_EVENT, type WebhookEvent } from "@/components/settings/webhook-meta";

/**
 * Outbound event emission.
 *
 * `emitEvent` is the ONE line a Server Action adds after its database write. It
 * queues a `WebhookDelivery` row per subscribed hook; nothing is sent here. The
 * job runner (lib/jobs/webhooks.ts) does the POSTing, on its own schedule, with
 * its own retries.
 *
 * THREE PROPERTIES THIS FILE GUARANTEES, because every caller depends on them:
 *
 *   1. IT NEVER THROWS. A caller has already committed a ticket, an invoice, a
 *      payment. A webhook table that is briefly unreachable must not undo that
 *      or turn a successful save into a red toast. Failures are logged and
 *      swallowed.
 *   2. IT IS CHEAP. One indexed read for the shop's active hooks, then one
 *      `createMany`. A shop with no webhooks configured pays a single query
 *      that returns nothing.
 *   3. IT IS SHOP-SCOPED. `shopId` comes from the caller's session (or the API
 *      key row), and both the hook lookup and every delivery row carry it, so
 *      one tenant's event can never be queued against another tenant's hook.
 *
 * CALL IT AFTER THE WRITE, NEVER INSIDE THE TRANSACTION. A queued delivery for
 * a transaction that then rolled back would announce something that never
 * happened, and that is far worse than an announcement arriving 200ms late.
 */

/**
 * The envelope every webhook body uses.
 *
 *     { id, event, created, shopId, data: { … } }
 *
 * `id` identifies the EVENT, and is shared by every hook that receives it —
 * a consumer subscribing two endpoints can tell they saw the same fact twice.
 * The per-hook attempt is identified separately by `X-RepairFlow-Delivery`.
 */
export type EventPayload = {
  id: string;
  event: string;
  /** ISO 8601 UTC. */
  created: string;
  shopId: string;
  data: Record<string, unknown>;
};

export function buildPayload(
  shopId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): EventPayload {
  return {
    // The Web Crypto global, not `node:crypto`: this module is reachable from
    // lib/jobs, which Next also compiles for the Edge runtime, and a Node-only
    // import there is a build warning for a dependency this line does not need.
    id: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
    event,
    created: new Date().toISOString(),
    shopId,
    data,
  };
}

/**
 * Queues `event` for every active webhook in `shopId` that subscribes to it.
 *
 * Returns how many deliveries were queued — useful to a test and to the "send
 * test event" button, ignored by every production caller.
 */
export async function emitEvent(
  shopId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<number> {
  try {
    const hooks = await db.webhook.findMany({
      where: {
        shopId,
        active: true,
        // Postgres array containment: subscribed to this event by name, or to
        // everything. `hasSome` is one indexable predicate rather than loading
        // every hook and filtering in JavaScript.
        events: { hasSome: [event, WILDCARD_EVENT] },
      },
      select: { id: true },
    });

    if (hooks.length === 0) return 0;

    const payload = buildPayload(shopId, event, data);

    const result = await db.webhookDelivery.createMany({
      data: hooks.map((hook) => ({
        shopId,
        webhookId: hook.id,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: "pending",
        // Due immediately; the next job pass picks it up.
        nextAttemptAt: new Date(),
      })),
    });

    return result.count;
  } catch (error) {
    // Deliberately swallowed — see the contract at the top of this file.
    console.error(`[events] could not queue ${event} for shop ${shopId}:`, error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Entity emitters
// ---------------------------------------------------------------------------

/**
 * The rest of this file exists so a Server Action's diff is ONE line.
 *
 * Each emitter takes the ids the caller already has, checks whether anybody is
 * listening, and only then loads the entity to build its summary. A shop with
 * no webhooks pays one indexed query and reads nothing else — which is what
 * makes it safe to sprinkle these through the hot paths.
 *
 * WHAT GOES IN A SUMMARY: the fields the v1 API already publishes for that
 * entity. Never a device password, an internal note, a diagnostic note, staff
 * email, or a customer's private notes — a webhook body lands in somebody
 * else's log file, so the bar is "would we serve this to an API key", and the
 * answer has to be yes.
 */

async function hasSubscribers(shopId: string, event: WebhookEvent): Promise<boolean> {
  const hook = await db.webhook.findFirst({
    where: {
      shopId,
      active: true,
      events: { hasSome: [event, WILDCARD_EVENT] },
    },
    select: { id: true },
  });
  return hook !== null;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Wraps an emitter so a failed lookup can never reach the caller. */
async function safely(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error("[events] emitter failed:", error);
  }
}

export async function emitTicketEvent(
  shopId: string,
  event: Extract<WebhookEvent, `ticket.${string}`>,
  ticketId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, shopId },
      select: {
        id: true,
        number: true,
        subject: true,
        problemType: true,
        status: true,
        priority: true,
        source: true,
        customerId: true,
        assignedToId: true,
        dueDate: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!ticket) return;

    await emitEvent(shopId, event, {
      ...ticket,
      dueDate: iso(ticket.dueDate),
      resolvedAt: iso(ticket.resolvedAt),
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    });
  });
}

export async function emitCustomerEvent(
  shopId: string,
  event: Extract<WebhookEvent, `customer.${string}`>,
  customerId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const customer = await db.customer.findFirst({
      where: { id: customerId, shopId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        email: true,
        phone: true,
        mobile: true,
        createdAt: true,
      },
    });
    if (!customer) return;

    await emitEvent(shopId, event, {
      ...customer,
      createdAt: customer.createdAt.toISOString(),
    });
  });
}

export async function emitInvoiceEvent(
  shopId: string,
  event: Extract<WebhookEvent, `invoice.${string}`>,
  invoiceId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, shopId },
      select: {
        id: true,
        number: true,
        status: true,
        customerId: true,
        ticketId: true,
        estimateId: true,
        taxRateBps: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
      },
    });
    if (!invoice) return;

    // Totals are never stored (see the schema note on Invoice), so they are
    // computed here with the same function the screens and the API use.
    const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);

    await emitEvent(shopId, event, {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      customerId: invoice.customerId,
      ticketId: invoice.ticketId,
      estimateId: invoice.estimateId,
      taxRateBps: invoice.taxRateBps,
      dueDate: iso(invoice.dueDate),
      paidAt: iso(invoice.paidAt),
      createdAt: invoice.createdAt.toISOString(),
      totals: {
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents: totals.paidCents,
        balanceCents: totals.balanceCents,
      },
    });
  });
}

export async function emitEstimateEvent(
  shopId: string,
  event: Extract<WebhookEvent, `estimate.${string}`>,
  estimateId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const estimate = await db.estimate.findFirst({
      where: { id: estimateId, shopId },
      select: {
        id: true,
        number: true,
        status: true,
        customerId: true,
        ticketId: true,
        taxRateBps: true,
        expiresAt: true,
        approvedAt: true,
        createdAt: true,
      },
    });
    if (!estimate) return;

    await emitEvent(shopId, event, {
      ...estimate,
      expiresAt: iso(estimate.expiresAt),
      approvedAt: iso(estimate.approvedAt),
      createdAt: estimate.createdAt.toISOString(),
    });
  });
}

export async function emitAppointmentEvent(
  shopId: string,
  event: Extract<WebhookEvent, `appointment.${string}`>,
  appointmentId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const appointment = await db.appointment.findFirst({
      where: { id: appointmentId, shopId },
      select: {
        id: true,
        title: true,
        status: true,
        customerId: true,
        ticketId: true,
        assignedToId: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
      },
    });
    if (!appointment) return;

    await emitEvent(shopId, event, {
      ...appointment,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      createdAt: appointment.createdAt.toISOString(),
    });
  });
}

export async function emitLeadEvent(
  shopId: string,
  event: Extract<WebhookEvent, `lead.${string}`>,
  leadId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, event))) return;

    const lead = await db.lead.findFirst({
      where: { id: leadId, shopId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        source: true,
        message: true,
        status: true,
        customerId: true,
        ticketId: true,
        createdAt: true,
      },
    });
    if (!lead) return;

    await emitEvent(shopId, event, {
      ...lead,
      createdAt: lead.createdAt.toISOString(),
    });
  });
}

export async function emitPaymentEvent(
  shopId: string,
  paymentId: string,
): Promise<void> {
  await safely(async () => {
    if (!(await hasSubscribers(shopId, "payment.recorded"))) return;

    const payment = await db.payment.findFirst({
      where: { id: paymentId, shopId },
      select: {
        id: true,
        invoiceId: true,
        amountCents: true,
        method: true,
        reference: true,
        createdAt: true,
        invoice: { select: { number: true, status: true, customerId: true } },
      },
    });
    if (!payment) return;

    await emitEvent(shopId, "payment.recorded", {
      id: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice.number,
      invoiceStatus: payment.invoice.status,
      customerId: payment.invoice.customerId,
      amountCents: payment.amountCents,
      method: payment.method,
      reference: payment.reference,
      createdAt: payment.createdAt.toISOString(),
    });
  });
}
