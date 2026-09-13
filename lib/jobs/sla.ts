import { db } from "@/lib/db";
import { appUrl } from "@/lib/comms/config";
import { deliverEmail } from "@/lib/comms/drivers";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";

/**
 * SLA breaches: the job that notices a promise was missed.
 *
 * Two stamps, two jobs, deliberately separate:
 *
 *   slaBreachedAt   the moment we first *saw* the ticket run past its due
 *                   date. Set once and never cleared, so the breach survives
 *                   somebody pushing the due date out afterwards.
 *   slaNotifiedAt   the moment somebody was told. Gates the alert to exactly
 *                   one per ticket, however many times the job runs.
 *
 * WHO GETS THE MAIL. The assigned tech, or — when nobody is assigned, which is
 * precisely how a ticket ends up late — every active owner. This is internal
 * staff mail about the shop's own work, so it goes through the email driver
 * directly and writes NO CommunicationLog row: that outbox is the record of
 * what was said to a CUSTOMER, and filling it with staff nags would make it
 * useless for the question it exists to answer.
 */

/** How many breached tickets one pass will notify about. Keeps a backlog sane. */
const MAX_ALERTS_PER_RUN = 25;

export type SlaRunResult = {
  breached: number;
  notified: number;
  errors: string[];
};

export async function runSlaChecksForShop(shopId: string): Promise<SlaRunResult> {
  const result: SlaRunResult = { breached: 0, notified: 0, errors: [] };
  const now = new Date();

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });
  if (!shop) return result;

  // Open tickets that are past their promised date. `slaBreachedAt: null` is
  // what makes the stamp idempotent — a ticket already marked is not re-marked.
  const overdue = await db.ticket.findMany({
    where: {
      shopId,
      status: { not: RESOLVED_STATUS },
      dueDate: { lt: now },
      slaBreachedAt: null,
    },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      number: true,
      subject: true,
      dueDate: true,
      slaNotifiedAt: true,
      assignedTo: { select: { name: true, email: true, active: true } },
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });

  if (overdue.length === 0) return result;

  const stamped = await db.ticket.updateMany({
    where: { id: { in: overdue.map((ticket) => ticket.id) }, shopId },
    data: { slaBreachedAt: now },
  });
  result.breached = stamped.count;

  // Loaded once, not per ticket: the unassigned-ticket fallback is the same
  // list of owners every time.
  const owners = await db.user.findMany({
    where: { shopId, role: "OWNER", active: true },
    select: { name: true, email: true },
  });

  for (const ticket of overdue.slice(0, MAX_ALERTS_PER_RUN)) {
    if (ticket.slaNotifiedAt) continue;

    const recipients =
      ticket.assignedTo && ticket.assignedTo.active && ticket.assignedTo.email
        ? [{ name: ticket.assignedTo.name, email: ticket.assignedTo.email }]
        : owners;

    if (recipients.length === 0) {
      result.errors.push(`ticket #${ticket.number}: nobody to alert`);
      continue;
    }

    const customer =
      ticket.customer.businessName ||
      `${ticket.customer.firstName} ${ticket.customer.lastName}`.trim();
    const due = ticket.dueDate ? ticket.dueDate.toLocaleString() : "an earlier date";
    const link = `${appUrl()}/tickets/${ticket.id}`;

    const subject = `Overdue: ticket #${ticket.number} — ${ticket.subject}`;
    // Deliberately NOT renderEmail(): that template's footer speaks to a
    // customer ("view your repairs"), and this is a note to a colleague.
    const message = staffAlert({
      shopName: shop.name,
      subject,
      lines: [
        `Ticket #${ticket.number} — ${ticket.subject} — has passed its due date.`,
        `Customer: ${customer}`,
        `Due: ${due}`,
      ],
      link,
    });

    let sent = false;
    for (const recipient of recipients) {
      const status = await deliverEmail({
        to: recipient.email,
        subject,
        text: message.text,
        html: message.html,
      });
      if (status.startsWith("failed")) {
        result.errors.push(`ticket #${ticket.number} -> ${recipient.email}: ${status}`);
      } else {
        sent = true;
      }
    }

    // Only a delivery that actually went somewhere closes the alert out; a
    // provider outage leaves the ticket eligible for the next pass.
    if (sent) {
      await db.ticket.updateMany({
        where: { id: ticket.id, shopId },
        data: { slaNotifiedAt: new Date() },
      });
      result.notified += 1;
    }
  }

  return result;
}

/**
 * A plain, unbranded internal alert: the facts, then a link to the ticket.
 * Kept here rather than in lib/comms/templates.ts because nothing else sends
 * staff mail yet, and a one-off does not earn a shared abstraction.
 */
function staffAlert(input: {
  shopName: string;
  subject: string;
  lines: string[];
  link: string;
}): { text: string; html: string } {
  const text = [
    input.shopName,
    "",
    ...input.lines,
    "",
    `Open the ticket: ${input.link}`,
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1a17;">
  <p style="margin:0 0 6px;font-weight:700;">${esc(input.shopName)}</p>
  <p style="margin:0 0 14px;font-size:18px;font-weight:700;">${esc(input.subject)}</p>
  ${input.lines.map((line) => `<p style="margin:0 0 8px;">${esc(line)}</p>`).join("")}
  <p style="margin:14px 0 0;"><a href="${esc(input.link)}" style="color:#111214;font-weight:600;">Open the ticket</a></p>
</div>`;

  return { text, html };
}

/** Minimal HTML escaping — every value here is shop-authored text. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
