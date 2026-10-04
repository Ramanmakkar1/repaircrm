import { formatCents } from "@/lib/money";
import { estimateMoneyLine, shortDay } from "./record-format";
import type { EstimatePrimary, InvoicePrimary } from "./primary-action";

/**
 * The plain-words side of the Easy-mode bill screen (the POS-style receipt for
 * an invoice or an estimate).
 *
 * Pure on purpose, like `record-format.ts` next door: every sentence the screen
 * shows ("$450.00 due", "Overdue since Oct 2", "Paid in full"), which tiles sit
 * under the big button, and the order of the activity feed are decided here
 * from plain values, so the rules are unit-tested and the components stay
 * layout only. The clock is passed in (the page reads it once through
 * `requestNow`). No money is calculated here: every amount arrives already
 * computed by `refundAwareTotals` / `calcTotals`, and is only formatted.
 */

const DAY_MS = 86_400_000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole calendar days (UTC) from `from` up to the day of `now`. */
function daysLate(from: Date, now: number): number {
  const today = new Date(now);
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

/* ------------------------------------------------------------------ tabs ---- */

export type DocTab = "bill" | "customer" | "activity" | "share";

const TAB_KEYS: readonly DocTab[] = ["bill", "customer", "activity", "share"];

/** `?tab=` to a tab. Anything unknown (or repeated) is the first tab, never an error. */
export function parseDocTab(raw: string | string[] | null | undefined): DocTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TAB_KEYS.find((key) => key === value) ?? "bill";
}

/** The URL of a tab. The first tab is the bare path so the plain link stays the plain link. */
export function docTabHref(basePath: string, tab: DocTab): string {
  return tab === "bill" ? basePath : `${basePath}?tab=${tab}`;
}

/** The tab row, as `FilterTabs` wants it. `first` is "Bill" for an invoice and "Quote" for an estimate. */
export function docTabs(basePath: string, active: DocTab, first: "Bill" | "Quote") {
  const labels: Record<DocTab, string> = { bill: first, customer: "Customer", activity: "Activity", share: "Share" };
  return TAB_KEYS.map((key) => ({ label: labels[key], href: docTabHref(basePath, key), active: key === active }));
}

/* --------------------------------------------------------- invoice balance -- */

export type BalanceState = "due" | "overdue" | "paid" | "draft" | "void";
export type WhenTone = "alert" | "good" | "muted" | "plain";

export interface BalanceBlock {
  state: BalanceState;
  /** The big figure while money is owed ("$450.00"); null for Paid in full, Draft and Voided. */
  figure: string | null;
  /** What sits beside the figure, or stands alone: "due", "Paid in full", "Draft", "Voided". */
  word: string;
  /** Figure and word as one sentence: "$450.00 due". */
  headline: string;
  /** When, in words: "Overdue since Oct 2 · 1 day late", "Due Oct 12", "Paid Sep 25". */
  when: string;
  whenTone: WhenTone;
  /** What has come in so far, in one line. */
  collected: string;
}

export interface BalanceInput {
  status: string;
  totalCents: number;
  /** Money taken, before refunds. */
  paidCents: number;
  refundedCents: number;
  /** Refund-aware, from `refundAwareTotals`. May be negative after an overpayment. */
  balanceCents: number;
  dueDate: Date | string | null;
  paidAt: Date | string | null;
}

/**
 * The hero of the invoice screen: the amount due in very large type, when it
 * is due in words, and what has been collected. A balance is never shown for a
 * draft or a voided bill, and "Paid in full" is decided from the refund-aware
 * balance, so a part-refunded invoice never reads "Paid" beside a "Partial"
 * badge.
 */
export function balanceBlock(input: BalanceInput, now: number): BalanceBlock {
  const total = formatCents(input.totalCents);

  if (input.status === "VOID") {
    return {
      state: "void",
      figure: null,
      word: "Voided",
      headline: "Voided",
      when: "Nothing is owed on this invoice",
      whenTone: "muted",
      collected: `Total was ${total}`,
    };
  }
  if (input.status === "DRAFT") {
    return {
      state: "draft",
      figure: null,
      word: "Draft",
      headline: "Draft",
      when: "Not sent yet",
      whenTone: "muted",
      collected: `Total ${total}`,
    };
  }

  const paid = formatCents(input.paidCents);
  const refunded = formatCents(input.refundedCents);

  if (input.balanceCents <= 0) {
    const paidDay = shortDay(input.paidAt, now);
    const over = input.balanceCents < 0 ? `Overpaid by ${formatCents(-input.balanceCents)}` : null;
    return {
      state: "paid",
      figure: null,
      word: "Paid in full",
      headline: "Paid in full",
      when: over ?? (paidDay ? `Paid ${paidDay}` : "Nothing left to pay"),
      whenTone: "good",
      collected: input.refundedCents > 0 ? `Collected ${paid}, refunded ${refunded}` : `Collected ${paid}`,
    };
  }

  const figure = formatCents(input.balanceCents);
  const due = toDate(input.dueDate);
  let when = due ? `Due ${shortDay(due, now)}` : "Due on receipt";
  let whenTone: WhenTone = "plain";
  let state: BalanceState = "due";

  // Late means the due day has started and money is still owed.
  if (due && due.getTime() < now) {
    const days = daysLate(due, now);
    state = "overdue";
    whenTone = "alert";
    when = days <= 0 ? "Due today" : `Overdue since ${shortDay(due, now)} · ${days} ${days === 1 ? "day" : "days"} late`;
  }

  let collected = "Nothing collected yet";
  if (input.refundedCents > 0) collected = `Collected ${paid}, refunded ${refunded}`;
  else if (input.paidCents > 0) collected = `Collected so far ${paid} of ${total}`;

  return { state, figure, word: "due", headline: `${figure} due`, when, whenTone, collected };
}

/* ----------------------------------------------------------- quote block ---- */

export interface QuoteBlock {
  /** The quoted total, always shown. */
  figure: string;
  /** "Estimate" beside it. */
  word: string;
  /** Where the quote stands, in words: "Waiting for a yes". */
  state: string;
  /** The date that matters: "Expires Oct 10", "Expired Oct 1", "Approved Sep 29". Null when none. */
  when: string | null;
  whenTone: WhenTone;
}

export interface QuoteInput {
  status: string;
  totalCents: number;
  expiresAt: Date | string | null;
  approvedAt: Date | string | null;
  /** Open and past its expiry date. */
  expired: boolean;
}

/** The hero of the estimate screen. Nothing is owed on a quote, so the figure is the quoted total. */
export function quoteBlock(input: QuoteInput, now: number): QuoteBlock {
  const state = estimateMoneyLine(input.status).text || "Estimate";
  const approved = shortDay(input.approvedAt, now);
  const expires = shortDay(input.expiresAt, now);
  const open = input.status === "DRAFT" || input.status === "SENT";

  let when: string | null = null;
  let whenTone: WhenTone = "muted";
  if (input.expired) {
    when = `Expired ${expires}`;
    whenTone = "alert";
  } else if (open && expires) {
    when = `Expires ${expires}`;
    whenTone = "plain";
  } else if ((input.status === "APPROVED" || input.status === "CONVERTED") && approved) {
    when = `Approved ${approved}`;
    whenTone = "good";
  }

  return { figure: formatCents(input.totalCents), word: "estimate", state, when, whenTone };
}

/* --------------------------------------------------------- the big button --- */

/** The words on the one big button. Null when the screen offers none (a voided bill). */
export function invoicePrimaryLabel(
  primary: InvoicePrimary,
  input: { alreadySent: boolean; receiptable: boolean },
): string | null {
  switch (primary) {
    case "pay":
      return "Take payment";
    case "send":
      return input.alreadySent ? "Send again" : "Send";
    case "print":
      return input.receiptable ? "Print receipt" : "Print";
    default:
      return null;
  }
}

export function estimatePrimaryLabel(
  primary: EstimatePrimary,
  input: { alreadySent: boolean; invoiceNumber: number | null },
): string | null {
  switch (primary) {
    case "send":
      return input.alreadySent ? "Send again" : "Send";
    case "convert":
      return "Convert to invoice";
    case "invoice":
      return input.invoiceNumber !== null ? `Open invoice #${input.invoiceNumber}` : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------ quick tiles --- */

/**
 * The tiles under the big button. `send` and `message` are two tiles of the one
 * send dialog (they sit side by side), `receipt` is "Send receipt".
 */
export type QuickTile = "pay" | "send" | "message" | "receipt" | "print" | "copy" | "edit" | "more";

/**
 * Which tiles a bill shows, in order. The big button is never repeated as a
 * tile, and a draft or an open quote has Send as its big button already (its
 * own menu offers text and both), so only the rest sit beside it. Everything
 * else stays in "More", so no action is lost by choosing the front row.
 */
export function invoiceTiles(input: {
  primary: InvoicePrimary;
  voided: boolean;
  receiptable: boolean;
  /** A payment can be taken now (not void, money owing). Only a draft needs it here: its big button is Send. */
  canTakePayment?: boolean;
}): QuickTile[] {
  if (input.voided) return ["print", "more"];
  // A draft's big button is Send, but a deposit or a cash sale can still be
  // rung up against it, so Take payment is the first tile, not lost to the menu.
  if (input.primary === "send") return [...(input.canTakePayment ? (["pay"] as const) : []), "edit", "print", "copy", "more"];
  if (input.primary === "print") return [...(input.receiptable ? (["receipt"] as const) : []), "send", "message", "copy", "more"];
  return ["send", "message", "print", "copy", "more"];
}

export function estimateTiles(input: { primary: EstimatePrimary; status: string }): QuickTile[] {
  if (input.status === "CONVERTED") return ["print", "copy", "more"];
  if (input.primary === "send") return ["edit", "print", "copy", "more"];
  return ["send", "message", "print", "copy", "more"];
}

/**
 * How the tiles share their rows. Four tiles are a 2 x 2 square (three then
 * one would leave a lone full-width tile); any other number flows three to a
 * row and the last row stretches to fill, so there is never a hole.
 */
export function tilesLayoutClass(count: number): string {
  return count === 4 ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2";
}

/* ------------------------------------------------------------- line rows ---- */

export interface LineRow {
  description: string;
  /** Null when blank. */
  serial: string | null;
  /** "2 × $60.00". */
  qtyLine: string;
  amountCents: number;
  /** In words, so a tax flag never rests on a tick or a colour. */
  tax: "Taxable" | "No tax";
}

/** One line of a bill as the list shows it. The amount is quantity x rate, the same product the table showed. */
export function lineRow(line: {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serial?: string | null;
}): LineRow {
  const serial = line.serial?.trim();
  return {
    description: line.description,
    serial: serial ? serial : null,
    qtyLine: `${line.quantity} × ${formatCents(line.unitPriceCents)}`,
    amountCents: line.quantity * line.unitPriceCents,
    tax: line.taxable ? "Taxable" : "No tax",
  };
}

/* -------------------------------------------------------- activity feed ----- */

export type ActivityKind = "created" | "email" | "sms" | "payment" | "refund" | "paid" | "approved" | "converted";

export interface ActivityItem {
  key: string;
  at: Date;
  kind: ActivityKind;
  /** The sentence: "Emailed to dana@example.com", "Payment taken". */
  title: string;
  /** A second line, or null. */
  detail: string | null;
  /** What came of it, in words ("Sent", "Not sent: opted out"), or null when it needs no word. */
  outcome: string | null;
  /** The outcome needs a person (it failed or was skipped). */
  alert: boolean;
  /** A signed amount in words ("$450.00", "-$50.00"), or null. */
  amount: string | null;
}

export interface MessageRow {
  id: string;
  createdAt: Date;
  type: string;
  direction: string;
  to: string;
  subject: string | null;
  status: string;
}

/** The raw `CommunicationLog.status` in words. "logged" is how a dev mailbox records a send. */
export function messageOutcome(status: string): { text: string; alert: boolean } {
  const raw = status.trim();
  const lower = raw.toLowerCase();
  if (lower === "sent" || lower === "logged") return { text: "Sent", alert: false };
  if (lower.startsWith("skipped")) {
    const why = raw.slice(raw.indexOf(":") + 1).trim();
    return { text: lower.includes(":") && why ? `Not sent: ${why}` : "Not sent", alert: true };
  }
  if (lower.startsWith("failed")) {
    const why = raw.slice(raw.indexOf(":") + 1).trim();
    return { text: lower.includes(":") && why ? `Failed: ${why}` : "Failed", alert: true };
  }
  // A bounce or a rejection reached the provider but not the customer.
  const trouble = /bounce|reject|undeliver|error|complain|block/.test(lower);
  return { text: raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown", alert: trouble };
}

function messageItem(row: MessageRow): ActivityItem {
  const outcome = messageOutcome(row.status);
  const inbound = row.direction === "IN";
  const sms = row.type === "SMS";
  const title = inbound
    ? `Message from ${row.to || "the customer"}`
    : `${sms ? "Texted" : "Emailed"} ${row.to ? `to ${row.to}` : "the customer"}`;
  return {
    key: `msg-${row.id}`,
    at: row.createdAt,
    kind: sms ? "sms" : "email",
    title,
    detail: row.subject?.trim() || null,
    outcome: inbound ? null : outcome.text,
    alert: inbound ? false : outcome.alert,
    amount: null,
  };
}

/** Newest first. At the same moment the record being written is the oldest thing, so it goes last. */
function byNewest(a: ActivityItem, b: ActivityItem): number {
  const byTime = b.at.getTime() - a.at.getTime();
  if (byTime !== 0) return byTime;
  return Number(a.kind === "created") - Number(b.kind === "created");
}

/**
 * Everything that has happened to an invoice, newest first: it was written,
 * what went out to the customer (and what came of it), every payment and
 * refund, and the day it was settled. Rows are only ever the ones the page was
 * handed, so this never reaches for the database.
 */
export function invoiceActivity(input: {
  createdAt: Date;
  paidAt: Date | null;
  settled: boolean;
  payments: ReadonlyArray<{ id: string; createdAt: Date; amountCents: number; label: string; takenBy: string | null }>;
  refunds: ReadonlyArray<{ id: string; createdAt: Date; amountCents: number; reason: string | null; failed: boolean; takenBy: string | null }>;
  messages: ReadonlyArray<MessageRow>;
}): ActivityItem[] {
  const items: ActivityItem[] = [
    {
      key: "created",
      at: input.createdAt,
      kind: "created",
      title: "Invoice written",
      detail: null,
      outcome: null,
      alert: false,
      amount: null,
    },
    ...input.messages.map(messageItem),
    ...input.payments.map<ActivityItem>((payment) => ({
      key: `pay-${payment.id}`,
      at: payment.createdAt,
      kind: "payment",
      title: `Payment taken: ${payment.label}`,
      detail: payment.takenBy ? `Taken by ${payment.takenBy}` : null,
      outcome: null,
      alert: false,
      amount: formatCents(payment.amountCents),
    })),
    ...input.refunds.map<ActivityItem>((refund) => ({
      key: `refund-${refund.id}`,
      at: refund.createdAt,
      kind: "refund",
      title: "Refund issued",
      detail: [refund.reason?.trim(), refund.takenBy ? `By ${refund.takenBy}` : null].filter(Boolean).join(" · ") || null,
      outcome: refund.failed ? "Failed: nothing was returned" : null,
      alert: refund.failed,
      amount: `−${formatCents(refund.amountCents)}`,
    })),
  ];
  if (input.settled && input.paidAt) {
    items.push({
      key: "paid",
      at: input.paidAt,
      kind: "paid",
      title: "Paid in full",
      detail: null,
      outcome: null,
      alert: false,
      amount: null,
    });
  }
  return items.sort(byNewest);
}

/** The same for a quote: written, sent, approved, and each invoice it became. */
export function estimateActivity(input: {
  createdAt: Date;
  approvedAt: Date | null;
  messages: ReadonlyArray<MessageRow>;
  invoices: ReadonlyArray<{ id: string; number: number; createdAt?: Date | null }>;
}): ActivityItem[] {
  const items: ActivityItem[] = [
    {
      key: "created",
      at: input.createdAt,
      kind: "created",
      title: "Estimate written",
      detail: null,
      outcome: null,
      alert: false,
      amount: null,
    },
    ...input.messages.map(messageItem),
  ];
  if (input.approvedAt) {
    items.push({
      key: "approved",
      at: input.approvedAt,
      kind: "approved",
      title: "Approved",
      detail: null,
      outcome: null,
      alert: false,
      amount: null,
    });
  }
  for (const invoice of input.invoices) {
    if (!invoice.createdAt) continue;
    items.push({
      key: `inv-${invoice.id}`,
      at: invoice.createdAt,
      kind: "converted",
      title: `Turned into invoice #${invoice.number}`,
      detail: null,
      outcome: null,
      alert: false,
      amount: null,
    });
  }
  return items.sort(byNewest);
}
