/**
 * The only builder of AI prompt bodies in RepairPilot.
 *
 * ============================================================================
 *  PROMPT PRIVACY CONTRACT — READ BEFORE ADDING A FIELD
 * ============================================================================
 *
 *  A prompt is an EGRESS. Whatever is written here leaves the building and
 *  lands on a third party's servers. The `select` in `loadTicketContext` is
 *  therefore an allow-list, not a convenience — it is the audit surface, and it
 *  is deliberately narrower than what the ticket page renders.
 *
 *  NEVER SENT:
 *    - customer email, phone, mobile, postal address
 *    - customer last name and business name  (first name only, see below)
 *    - Asset.password — the device unlock code captured at intake
 *    - Asset.serial — device-identifying, and no help in writing an update
 *    - staff names on comments (the author's ROLE is what shapes a draft)
 *
 *  SENT:
 *    - ticket number, subject, status, problem type, priority, dates
 *    - device type / make / model
 *    - diagnostic notes
 *    - comment bodies, public and private, with author role and date
 *    - charge descriptions, quantities and amounts
 *    - the customer's FIRST NAME, so the draft can open with a greeting
 *
 *  Charge amounts are in on purpose. The one hard rule a repair-shop update has
 *  to keep is "never quote a price that isn't real", and a model can only obey
 *  that if it can see the real ones.
 *
 *  Free text (notes, comments) is written by staff who may well have typed a
 *  callback number into it, so everything free-form goes through `redact()`
 *  before it is added. The allow-list is the wall; redaction is the net under it.
 * ============================================================================
 */

import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import type { DraftTone } from "./types";

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Strips contact details a human typed into a free-text field.
 *
 * Intentionally blunt. A false positive costs the draft one detail it didn't
 * need; a false negative mails a customer's phone number to a model vendor.
 */
export function redact(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email removed]")
    // 9+ chars of digits and phone punctuation: catches +1 (780) 555-0134 and
    // 780-555-0134, while a price like 1,234.56 is too short to match.
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number removed]");
}

/** First name only — "Dana Whitfield" and "Dana" both become "Dana". */
function firstNameOnly(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** How much history is worth sending. Older notes rarely change the reply. */
const MAX_COMMENTS = 20;
const MAX_COMMENT_CHARS = 600;

export type TicketContext = {
  number: number;
  subject: string;
  status: string;
  problemType: string;
  priority: string;
  customerFirstName: string;
  device: string;
  openedOn: string;
  updatedOn: string;
  dueOn: string | null;
  diagnosticNotes: string | null;
  comments: {
    on: string;
    role: string;
    visibility: "customer-facing" | "internal";
    body: string;
  }[];
  charges: { description: string; quantity: number; amount: string }[];
  chargesTotal: string;
};

/** ISO day. Times of day never matter to a repair update and add noise. */
function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Returns the prompt-safe view of a ticket, or null when the id doesn't belong
 * to this shop. Scoped with findFirst per the tenancy contract in lib/db.ts.
 */
export async function loadTicketContext(
  shopId: string,
  ticketId: string,
): Promise<TicketContext | null> {
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, shopId },
    // ---- ALLOW-LIST. Adding a field here sends it to a third party. ----
    select: {
      number: true,
      subject: true,
      status: true,
      problemType: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      diagnosticNotes: true,
      // firstName ONLY — no lastName, businessName, email, phone, address.
      customer: { select: { firstName: true } },
      // type/make/model ONLY — no serial, and never `password`.
      asset: { select: { type: true, make: true, model: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        take: MAX_COMMENTS,
        select: {
          body: true,
          isPublic: true,
          createdAt: true,
          // Role, not name: it tells the model who was speaking without
          // shipping the staff directory along with the ticket.
          author: { select: { role: true } },
        },
      },
      charges: {
        orderBy: { createdAt: "asc" },
        select: { description: true, quantity: true, unitPriceCents: true },
      },
    },
  });

  if (!ticket) return null;

  const device = ticket.asset
    ? [ticket.asset.make, ticket.asset.model, `(${ticket.asset.type})`]
        .filter(Boolean)
        .join(" ")
    : "no device on file";

  return {
    number: ticket.number,
    subject: redact(ticket.subject),
    status: ticket.status,
    problemType: ticket.problemType,
    priority: ticket.priority,
    customerFirstName: firstNameOnly(ticket.customer.firstName) || "there",
    device,
    openedOn: day(ticket.createdAt),
    updatedOn: day(ticket.updatedAt),
    dueOn: ticket.dueDate ? day(ticket.dueDate) : null,
    diagnosticNotes: ticket.diagnosticNotes
      ? redact(ticket.diagnosticNotes)
      : null,
    comments: ticket.comments.map((comment) => ({
      on: day(comment.createdAt),
      role: comment.author?.role ?? "STAFF",
      visibility: comment.isPublic ? "customer-facing" : "internal",
      body: redact(comment.body).slice(0, MAX_COMMENT_CHARS),
    })),
    charges: ticket.charges.map((charge) => ({
      description: redact(charge.description),
      quantity: charge.quantity,
      amount: formatCents(charge.quantity * charge.unitPriceCents),
    })),
    chargesTotal: formatCents(
      ticket.charges.reduce(
        (sum, charge) => sum + charge.quantity * charge.unitPriceCents,
        0,
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderTicketContext(ctx: TicketContext): string {
  const lines = [
    `Ticket: #${ctx.number} — ${ctx.subject}`,
    `Customer first name: ${ctx.customerFirstName}`,
    `Device: ${ctx.device}`,
    `Problem type: ${ctx.problemType}`,
    `Current status: ${ctx.status}`,
    `Priority: ${ctx.priority}`,
    `Opened: ${ctx.openedOn}`,
    `Last activity: ${ctx.updatedOn}`,
  ];
  if (ctx.dueOn) lines.push(`Promised by: ${ctx.dueOn}`);

  if (ctx.diagnosticNotes) {
    lines.push("", "Diagnostic notes:", ctx.diagnosticNotes);
  }

  lines.push("", "Charges recorded so far:");
  if (ctx.charges.length === 0) {
    lines.push("(none — no price has been quoted on this ticket)");
  } else {
    for (const charge of ctx.charges) {
      lines.push(`- ${charge.description} x${charge.quantity} — ${charge.amount}`);
    }
    lines.push(`Total of recorded charges: ${ctx.chargesTotal}`);
  }

  lines.push("", "History, oldest first:");
  if (ctx.comments.length === 0) {
    lines.push("(no notes yet)");
  } else {
    for (const comment of ctx.comments) {
      lines.push(`- [${comment.on}] [${comment.role}] [${comment.visibility}] ${comment.body}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const TONE_INSTRUCTION: Record<DraftTone, string> = {
  update:
    "Write a progress update. Say where the repair actually stands right now and what happens next. Do not imply it is finished.",
  ready:
    "Write a ready-for-pickup message. Say what was done, and that the device is ready to collect.",
  delay:
    "Write a delay message. Say plainly what is holding things up and what happens next. Do not over-apologise and do not invent a new completion date.",
};

/**
 * The guardrails, in priority order: don't invent prices, don't invent dates,
 * don't invent facts. Everything else is tone.
 */
export function draftReplySystemPrompt(signerFirstName: string): string {
  return [
    "You are the front-desk person at a friendly independent repair shop, writing a short message to a customer about their repair.",
    "",
    "Rules, in order of importance:",
    "1. NEVER state a price, a total, or a cost that is not in the 'Charges recorded so far' list. If that list is empty, do not mention money at all — not even a range or an estimate.",
    "2. NEVER promise a completion date, a pickup date, or a turnaround time unless it appears in the context as a promised-by date.",
    "3. NEVER invent a fact. If the notes do not say something, leave it out rather than guessing.",
    "4. Plain language, no jargon. Say 'the screen' not 'the LCD digitiser assembly', 'the battery is worn out' not 'the cell has degraded capacity'.",
    "5. Warm and direct. No corporate filler, no 'we value your business', no exclamation marks stacked up.",
    "6. Internal notes are context for you, not content for the customer. Never repeat an internal note verbatim and never mention that internal notes exist.",
    "7. 120 words maximum. Shorter is better.",
    `8. Open by greeting the customer by their first name, and sign off with just "${signerFirstName}" on its own line.`,
    "",
    "Output the message body only — no subject line, no email headers, no quotation marks around it, no commentary about what you wrote.",
  ].join("\n");
}

export function draftReplyPrompt(ctx: TicketContext, tone: DraftTone): string {
  return [
    TONE_INSTRUCTION[tone],
    "",
    "Here is everything known about this repair:",
    "",
    renderTicketContext(ctx),
  ].join("\n");
}

export const SUMMARIZE_SYSTEM_PROMPT = [
  "You are a senior repair technician bringing a colleague up to speed on a ticket they have never seen.",
  "",
  "Answer with 3 to 5 bullet points and nothing else:",
  "- the first bullets cover what has happened so far, oldest to newest",
  "- one bullet states where the ticket stands right now",
  "- the final bullet starts with 'Next:' and names the single most useful next action",
  "",
  "Rules:",
  "- Start every bullet with '- '. No heading, no preamble, no closing sentence.",
  "- One sentence per bullet.",
  "- Facts only. If the ticket is thin on detail, say so rather than filling the gap.",
  "- This is an internal note for staff, so name the real technical detail — but do not restate a price that is not in the charges list.",
].join("\n");

export function summarizePrompt(ctx: TicketContext): string {
  return ["Summarise this repair ticket:", "", renderTicketContext(ctx)].join("\n");
}
