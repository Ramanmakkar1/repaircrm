import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { withNextNumber } from "@/lib/sequence";
import { emitLeadEvent, emitTicketEvent } from "@/lib/events";
import { RESOLVED_STATUS } from "@/components/tickets/ticket-meta";

/**
 * Turning an inbound email or text into something staff can see.
 *
 * ONE FILE, BOTH CHANNELS. Email and SMS arrive in wildly different shapes, but
 * once the transport is peeled off they are the same three questions:
 *
 *   1. WHICH SHOP?     the address it was sent TO (see ./shop.ts)
 *   2. WHICH PERSON?   the address/number it came FROM
 *   3. WHICH TICKET?   "#1042" in the text, else their most recent open job,
 *                      else a brand new one
 *
 * and then the same four writes: a public TicketComment, an inbound
 * CommunicationLog row, `Ticket.lastInboundAt`, and — when the sender is
 * nobody we know — a Lead instead of all of the above.
 *
 * DEDUPE IS NOT OPTIONAL. Every provider retries, and a retry that appends a
 * second copy of a customer's message is worse than a dropped one: staff read
 * the timeline as a conversation. `providerMessageId` on CommunicationLog is
 * the key, checked before anything is written.
 */

export type InboundMessage = {
  shopId: string;
  channel: "EMAIL" | "SMS";
  /** The sender's email address or phone number. */
  from: string;
  /** Display name when the provider gave us one ("Ada Nguyen"). */
  fromName?: string | null;
  subject?: string | null;
  body: string;
  /** The provider's own id for this message. The dedupe key. */
  providerMessageId?: string | null;
};

export type InboundOutcome =
  | { kind: "duplicate"; logId: string }
  | { kind: "comment"; ticketId: string; ticketNumber: number; created: boolean }
  | { kind: "lead"; leadId: string }
  | { kind: "ignored"; reason: string };

/** Digits only, last 10 kept — how two spellings of one number are compared. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(-10);
}

/** `"Ada Nguyen" <ada@example.com>` -> `ada@example.com`. */
export function emailAddress(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

/** The display name in `"Ada Nguyen" <ada@…>`, or null. */
export function emailDisplayName(value: string): string | null {
  const match = /^\s*"?([^"<]+?)"?\s*</.exec(value);
  const name = match?.[1]?.trim();
  return name ? name : null;
}

/**
 * Plain text out of an HTML email.
 *
 * Not a parser and not trying to be. Scripts and styles go entirely (content
 * and all — dropping the tags but keeping the CSS would put a stylesheet in the
 * timeline), block-level tags become line breaks, everything else is stripped,
 * and the handful of entities that actually appear in mail are decoded. The
 * result is read by a human in a comment box, never rendered as markup.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Strips the quoted history off a reply.
 *
 * A customer answering "yes, go ahead" sends 40 lines, 38 of which are our own
 * email quoted back. Cutting at the first quote marker keeps the timeline
 * readable; the full message is still on the CommunicationLog row.
 */
export function stripQuotedReply(text: string): string {
  const markers = [
    /^\s*On .+ wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,
    /^\s*From:\s.+$/m,
  ];

  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }

  const trimmed = text.slice(0, cut).trim();
  // A reply that is ONLY quoted text would otherwise become an empty comment.
  return trimmed || text.trim();
}

/** `#1042` anywhere in the subject or body. */
export function ticketNumberIn(...parts: (string | null | undefined)[]): number | null {
  for (const part of parts) {
    if (!part) continue;
    const match = /#(\d{3,9})\b/.exec(part);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Customer lookup
// ---------------------------------------------------------------------------

/**
 * Finds the customer an inbound message came from.
 *
 * Email is an exact, case-insensitive match. Phone is matched on DIGITS, in
 * SQL, because a shop types numbers as `(780) 555-0134` and Twilio delivers
 * `+17805550134` — comparing the strings would never find anybody. The last ten
 * digits are used so a leading country code on one side and not the other still
 * matches.
 */
export async function findCustomer(
  shopId: string,
  channel: "EMAIL" | "SMS",
  from: string,
): Promise<{ id: string } | null> {
  if (channel === "EMAIL") {
    const address = emailAddress(from);
    if (!address) return null;
    return db.customer.findFirst({
      where: { shopId, email: { equals: address, mode: "insensitive" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const digits = phoneDigits(from);
  if (digits.length < 7) return null;

  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Customer"
    WHERE "shopId" = ${shopId}
      AND (
        regexp_replace(COALESCE("mobile", ''), '\\D', '', 'g') LIKE ${"%" + digits}
        OR regexp_replace(COALESCE("phone", ''), '\\D', '', 'g') LIKE ${"%" + digits}
      )
    ORDER BY "createdAt" ASC
    LIMIT 1
  `);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// The main entry point
// ---------------------------------------------------------------------------

export async function ingestInbound(
  message: InboundMessage,
): Promise<InboundOutcome> {
  const body = message.body.trim().slice(0, 20_000);
  if (!body) return { kind: "ignored", reason: "empty message" };

  // Dedupe FIRST. Providers retry, and the whole point of the id is that the
  // second delivery finds the first one and stops.
  if (message.providerMessageId) {
    const existing = await db.communicationLog.findFirst({
      where: {
        shopId: message.shopId,
        providerMessageId: message.providerMessageId,
      },
      select: { id: true },
    });
    if (existing) return { kind: "duplicate", logId: existing.id };
  }

  const customer = await findCustomer(message.shopId, message.channel, message.from);

  // Nobody we know wrote in. That is a LEAD, not a mystery to be dropped: it is
  // somebody asking a repair shop a question, which is the most valuable email
  // a repair shop receives.
  if (!customer) {
    const lead = await db.lead.create({
      data: {
        shopId: message.shopId,
        name: message.fromName?.trim() || message.from,
        email: message.channel === "EMAIL" ? emailAddress(message.from) : null,
        phone: message.channel === "SMS" ? message.from : null,
        source: message.channel === "EMAIL" ? "email" : "sms",
        message: [message.subject, body].filter(Boolean).join("\n\n").slice(0, 5000),
        status: "NEW",
      },
      select: { id: true },
    });

    await emitLeadEvent(message.shopId, "lead.created", lead.id);

    return { kind: "lead", leadId: lead.id };
  }

  const { ticket, created } = await resolveTicket(message, customer.id, body);

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.ticketComment.create({
      data: {
        shopId: message.shopId,
        ticketId: ticket.id,
        // No author: this is the CUSTOMER talking. A staff id here would make
        // the timeline claim an employee wrote it, and the "needs reply" rule
        // below counts staff comments to decide whether anyone has answered.
        authorId: null,
        body,
        isPublic: true,
        subject: message.subject?.slice(0, 200) ?? null,
        channel: message.channel,
      },
    });

    await tx.communicationLog.create({
      data: {
        shopId: message.shopId,
        customerId: customer.id,
        ticketId: ticket.id,
        type: message.channel,
        direction: "IN",
        // `to` on an inbound row is who it came FROM — the column is the other
        // party either way, which is what the outbox screen renders.
        to: message.from,
        subject: message.subject?.slice(0, 200) ?? null,
        body,
        status: "received",
        providerMessageId: message.providerMessageId ?? null,
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      // The stamp the "Needs reply" pill reads. Also bumps updatedAt, so a
      // customer chasing a job resets its staleness heat on the board.
      data: { lastInboundAt: now },
    });
  });

  if (created) {
    await emitTicketEvent(message.shopId, "ticket.created", ticket.id);
  }

  return {
    kind: "comment",
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    created,
  };
}

/**
 * Which ticket this message belongs on.
 *
 *   1. `#1042` in the subject or body, IF that ticket is this customer's. A
 *      number belonging to somebody else is ignored rather than obeyed — the
 *      sender does not get to choose whose ticket they post on.
 *   2. their most recently updated OPEN ticket — the overwhelmingly common
 *      case, because a customer replying to an update is replying about the
 *      job they have in the shop right now.
 *   3. a new ticket, stamped with the channel it arrived on.
 */
async function resolveTicket(
  message: InboundMessage,
  customerId: string,
  body: string,
): Promise<{ ticket: { id: string; number: number }; created: boolean }> {
  const number = ticketNumberIn(message.subject, body);

  if (number !== null) {
    const referenced = await db.ticket.findFirst({
      where: { shopId: message.shopId, number, customerId },
      select: { id: true, number: true },
    });
    if (referenced) return { ticket: referenced, created: false };
  }

  const open = await db.ticket.findFirst({
    where: {
      shopId: message.shopId,
      customerId,
      status: { not: RESOLVED_STATUS },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, number: true },
  });
  if (open) return { ticket: open, created: false };

  const created = await withNextNumber(message.shopId, "ticket", (next) =>
    db.ticket.create({
      data: {
        shopId: message.shopId,
        customerId,
        number: next,
        subject:
          message.subject?.trim().slice(0, 200) ||
          `${message.channel === "SMS" ? "Text" : "Email"} from ${message.fromName?.trim() || message.from}`,
        problemType: "Other",
        status: "New",
        source: message.channel === "EMAIL" ? "email" : "sms",
      },
      select: { id: true, number: true },
    }),
  );

  return { ticket: created, created: true };
}
