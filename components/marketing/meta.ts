/**
 * Shared, dependency-free vocabulary for marketing automations.
 *
 * Imported by BOTH the engine/server actions and the client form, so this file
 * must stay pure: no `db`, no `next/*`, no "use server".
 */

import type { StatusTone } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const CAMPAIGN_TRIGGERS = [
  "TICKET_RESOLVED",
  "INVOICE_PAID",
  "CUSTOMER_CREATED",
] as const;

export type CampaignTrigger = (typeof CAMPAIGN_TRIGGERS)[number];

/** What staff read on a chip. Always phrased from the event, never the enum. */
export const TRIGGER_LABEL: Record<CampaignTrigger, string> = {
  TICKET_RESOLVED: "After ticket resolved",
  INVOICE_PAID: "After invoice paid",
  CUSTOMER_CREATED: "After customer added",
};

/** One line of plain English for the form and the detail card. */
export const TRIGGER_HINT: Record<CampaignTrigger, string> = {
  TICKET_RESOLVED: "Counts from the moment a ticket is marked resolved.",
  INVOICE_PAID: "Counts from the day an invoice is paid in full.",
  CUSTOMER_CREATED: "Counts from the day the customer record was created.",
};

/** The source column on the sends table names the event that produced the row. */
export const TRIGGER_SOURCE_LABEL: Record<CampaignTrigger, string> = {
  TICKET_RESOLVED: "Ticket",
  INVOICE_PAID: "Invoice",
  CUSTOMER_CREATED: "New customer",
};

/** Plain `{ value, label }` data — a label *function* cannot cross to a client. */
export const TRIGGER_OPTIONS = CAMPAIGN_TRIGGERS.map((value) => ({
  value: value as string,
  label: TRIGGER_LABEL[value],
}));

export function asTrigger(value: unknown): CampaignTrigger {
  return CAMPAIGN_TRIGGERS.includes(value as CampaignTrigger)
    ? (value as CampaignTrigger)
    : "TICKET_RESOLVED";
}

export function triggerLabel(value: unknown): string {
  return TRIGGER_LABEL[asTrigger(value)];
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const CAMPAIGN_CHANNELS = ["EMAIL", "SMS"] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  EMAIL: "Email",
  SMS: "Text message",
};

export const CHANNEL_OPTIONS = CAMPAIGN_CHANNELS.map((value) => ({
  value: value as string,
  label: CHANNEL_LABEL[value],
}));

export function asChannel(value: unknown): CampaignChannel {
  return CAMPAIGN_CHANNELS.includes(value as CampaignChannel)
    ? (value as CampaignChannel)
    : "EMAIL";
}

/**
 * Carriers bill per 160-character segment; lib/comms/templates caps the whole
 * rendered text at 320. The counter in the form uses the same number so a body
 * that will be truncated at delivery is visibly over budget while it is typed.
 */
export const SMS_MAX_CHARS = 320;

export const BODY_MAX_CHARS = 4000;
export const SUBJECT_MAX_CHARS = 160;
export const NAME_MAX_CHARS = 120;
export const MAX_DELAY_DAYS = 365;

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

export type PlaceholderToken =
  | "firstName"
  | "shopName"
  | "ticketNumber"
  | "invoiceNumber";

export const PLACEHOLDERS: {
  token: PlaceholderToken;
  label: string;
  /** Which triggers actually carry a value for this token. */
  triggers: CampaignTrigger[] | "all";
}[] = [
  { token: "firstName", label: "First name", triggers: "all" },
  { token: "shopName", label: "Shop name", triggers: "all" },
  { token: "ticketNumber", label: "Ticket #", triggers: ["TICKET_RESOLVED"] },
  { token: "invoiceNumber", label: "Invoice #", triggers: ["INVOICE_PAID"] },
];

export type MessageVars = Partial<Record<PlaceholderToken, string | number | null>>;

/**
 * Substitutes `{{token}}` placeholders.
 *
 * A token the event cannot fill (an invoice number on a ticket campaign) is
 * replaced with an empty string rather than left as raw `{{invoiceNumber}}` —
 * a customer seeing template syntax is worse than a slightly short sentence.
 * Leftover double spaces from a dropped token are collapsed for the same reason.
 * Unknown tokens are left untouched so a typo is visible in the preview.
 */
export function renderMessage(body: string, vars: MessageVars): string {
  const known = new Set(PLACEHOLDERS.map((p) => p.token as string));
  return body
    .replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, rawToken: string) => {
      if (!known.has(rawToken)) return match;
      const value = vars[rawToken as PlaceholderToken];
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

/** Sample values so the form preview reads like a real message, not a form. */
export function previewVars(shopName: string): MessageVars {
  return {
    firstName: "Alex",
    shopName,
    ticketNumber: 1042,
    invoiceNumber: 1043,
  };
}

// ---------------------------------------------------------------------------
// Delay
// ---------------------------------------------------------------------------

/** "14 days later" — the phrase used on every card and chip. */
export function delayLabel(days: number): string {
  if (days <= 0) return "Straight away";
  if (days === 1) return "1 day later";
  return `${days} days later`;
}

/** Adds whole days without touching the time of day. Negative days go back. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// ---------------------------------------------------------------------------
// Send status
// ---------------------------------------------------------------------------

/**
 * `CampaignSend.status` is free text so a provider's reason survives verbatim
 * ("failed: resend 422 …"). The UI only ever needs the bucket it falls into.
 */
export type SendBucket = "scheduled" | "sending" | "sent" | "skipped" | "failed";

export function sendBucket(status: string): SendBucket {
  if (status === "scheduled") return "scheduled";
  if (status === "sending") return "sending";
  if (status === "sent") return "sent";
  if (status.startsWith("skipped")) return "skipped";
  if (status.startsWith("failed")) return "failed";
  return "scheduled";
}

/**
 * Where each outcome sits in the app-wide tone language (see
 * `components/ui/badge.tsx`): violet while it is waiting on its send date,
 * amber while the provider has it, green once it left, grey when it was never
 * going to go, red when it tried and failed.
 */
export const SEND_STATUS_META: Record<SendBucket, { tone: StatusTone }> = {
  scheduled: { tone: "waiting" },
  sending: { tone: "active" },
  sent: { tone: "success" },
  skipped: { tone: "neutral" },
  failed: { tone: "danger" },
};

/** "skipped: opted out" → "Opted out". Statuses are shown, not decoded. */
export function sendStatusLabel(status: string): string {
  const bucket = sendBucket(status);
  if (bucket === "scheduled") return "Scheduled";
  if (bucket === "sending") return "Sending…";
  if (bucket === "sent") return "Sent";
  const reason = status.slice(status.indexOf(":") + 1).trim();
  const head = bucket === "skipped" ? "Skipped" : "Failed";
  if (!reason || reason === status) return head;
  return `${head} · ${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Starter templates — the gallery a shop with no campaigns lands on
// ---------------------------------------------------------------------------

export type CampaignTemplate = {
  id: string;
  name: string;
  /** Why a shop would switch this on, in one sentence. */
  pitch: string;
  /** An icon key; the gallery maps it to a component (icons cannot cross RSC). */
  icon: "shield-check" | "calendar-clock" | "heart-handshake";
  trigger: CampaignTrigger;
  delayDays: number;
  channel: CampaignChannel;
  subject: string;
  body: string;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "follow-up-2-week",
    name: "2-Week Follow-Up",
    pitch:
      "Catches the repair that quietly came undone, while the customer still thinks of it as your repair.",
    icon: "shield-check",
    trigger: "TICKET_RESOLVED",
    delayDays: 14,
    channel: "EMAIL",
    subject: "How is your repair holding up?",
    body: `Hi {{firstName}},

It has been a couple of weeks since we finished the work on ticket #{{ticketNumber}}, so we wanted to check in — is everything still behaving the way it should?

If anything feels off, even something small, just reply to this message or give us a call. We would much rather take another look early than have you live with it.

And if it is all running smoothly, that is exactly what we like to hear.

Thanks for trusting us with it,
The team at {{shopName}}`,
  },
  {
    id: "check-in-90-day",
    name: "90-Day Check-In",
    pitch:
      "Three months on, a device is either fixed for good or whispering again — this is the nudge that finds out.",
    icon: "calendar-clock",
    trigger: "TICKET_RESOLVED",
    delayDays: 90,
    channel: "EMAIL",
    subject: "Three months on — how is it running?",
    body: `Hi {{firstName}},

It has been about three months since we handed your device back on ticket #{{ticketNumber}}. By this point a repair has usually either settled in for good or started hinting at something new.

If it is the second one, tell us and we will take a look. And if there is another device around the house or office that has been slow, hot, or not holding a charge, bring it by — we are happy to give it a quick once-over.

Thanks for being a customer,
The team at {{shopName}}`,
  },
  {
    id: "thank-you-paid",
    name: "Thank You",
    pitch:
      "A short, human thank-you two days after payment — the moment a happy customer is most likely to leave a review.",
    icon: "heart-handshake",
    trigger: "INVOICE_PAID",
    delayDays: 2,
    channel: "EMAIL",
    subject: "Thank you from {{shopName}}",
    body: `Hi {{firstName}},

A quick thank you — invoice #{{invoiceNumber}} is settled and everything is squared away on our end.

You had a choice about who to hand your device to, and we do not take that lightly. If the repair is behaving itself, a short review helps a shop our size more than you would think. And if it is not, tell us first — we would like the chance to make it right.

Thanks again,
The team at {{shopName}}`,
  },
];

export function findTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((template) => template.id === id);
}
