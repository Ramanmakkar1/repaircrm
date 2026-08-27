/**
 * DOCUMENT MESSAGES — the single source of truth for what a sent invoice,
 * estimate or receipt actually says.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 * ---------------------------------------------------------------------------
 * The send dialog shows staff a PREVIEW of the email and the SMS before they
 * press send. A preview built from a lookalike template is worse than no
 * preview at all: it is a promise the send path does not have to keep, and the
 * first time the two drift the shop learns about it from a customer.
 *
 * So the preview action and the send action both call the functions below, and
 * both hand the result to the same `renderEmail` / `renderSms` in ./templates.
 * The preview is not "like" what gets sent — it is produced by the same code.
 *
 * Pure string building: no `db`, no `next/*`. Callers load the rows.
 */

import { formatCents } from "@/lib/money";

import { estimateTokenPath, invoiceTokenPath, portalUrl } from "./config";
import type { SummaryRow } from "./templates";

/**
 * A fixed en-US short date, deliberately re-declared rather than imported from
 * components/billing/format.ts: `lib/` does not depend on `components/`, and a
 * three-line formatter is a cheaper price than that inversion.
 */
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function shortDate(value: Date | null | undefined): string {
  if (!value) return "—";
  const time = value.getTime();
  return Number.isNaN(time) ? "—" : SHORT_DATE.format(value);
}

/** What a caller needs to hand to `sendEmail` / `sendSms` for one document. */
export type DocumentMessage = {
  /** Default subject line. Staff may override it in the dialog. */
  subject: string;
  /** The email body: greeting + the staff member's message. */
  emailBody: string;
  /** Facts rendered as the summary table under the body. */
  summary: SummaryRow[];
  /** The SMS message, before `renderSms` adds the shop name and the link. */
  smsBody: string;
  /** Portal path both channels link to — always a frictionless token link. */
  portalPath: string;
  /** Absolute form of `portalPath`, for the preview and the clipboard. */
  linkUrl: string;
  /** The small line under the shop name in the email header. */
  context: string;
};

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export type InvoiceMessageInput = {
  shopName: string;
  customerFirstName: string;
  number: number;
  publicToken: string;
  createdAt: Date;
  dueDate: Date | null;
  lineCount: number;
  totalCents: number;
  balanceCents: number;
  /** The staff member's personal message. Blank falls back to the default. */
  message?: string | null;
  /** Subject override from the dialog. Blank falls back to the default. */
  subject?: string | null;
};

export function defaultInvoiceSubject(number: number, shopName: string): string {
  return `Invoice #${number} from ${shopName}`;
}

/**
 * The default personal message. One sentence, because it is prepended to the
 * summary table in the email AND carried into the SMS, where every character
 * is a billable segment.
 */
export function defaultInvoiceMessage(
  number: number,
  totalCents: number,
): string {
  return `Invoice #${number} for ${formatCents(totalCents)} is ready.`;
}

export function invoiceMessage(input: InvoiceMessageInput): DocumentMessage {
  const message =
    (input.message ?? "").trim() ||
    defaultInvoiceMessage(input.number, input.totalCents);

  const balance = Math.max(input.balanceCents, 0);
  const portalPath = invoiceTokenPath(input.publicToken);

  const summary: SummaryRow[] = [
    { label: "Invoice", value: `#${input.number}` },
    { label: "Date", value: shortDate(input.createdAt) },
    {
      label: "Due",
      value: input.dueDate ? shortDate(input.dueDate) : "On receipt",
    },
    {
      label: "Items",
      value: `${input.lineCount} ${input.lineCount === 1 ? "line" : "lines"}`,
    },
    { label: "Total", value: formatCents(input.totalCents) },
    { label: "Balance due", value: formatCents(balance) },
  ];

  const dueSuffix = input.dueDate ? ` due ${shortDate(input.dueDate)}` : "";
  const smsBody =
    balance > 0
      ? `${message} Balance ${formatCents(balance)}${dueSuffix}. View or pay:`
      : `${message} Nothing left to pay — thank you.`;

  return {
    subject:
      (input.subject ?? "").trim() ||
      defaultInvoiceSubject(input.number, input.shopName),
    emailBody: `Hi ${input.customerFirstName},\n\n${message}`,
    summary,
    smsBody,
    portalPath,
    linkUrl: portalUrl(portalPath),
    context: `Invoice #${input.number}`,
  };
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export type EstimateMessageInput = {
  shopName: string;
  customerFirstName: string;
  number: number;
  publicToken: string;
  createdAt: Date;
  expiresAt: Date | null;
  lineCount: number;
  totalCents: number;
  message?: string | null;
  subject?: string | null;
};

export function defaultEstimateSubject(
  number: number,
  shopName: string,
): string {
  return `Estimate #${number} from ${shopName}`;
}

export function defaultEstimateMessage(
  number: number,
  totalCents: number,
): string {
  return `Estimate #${number} for ${formatCents(
    totalCents,
  )} is ready for you to review. Nothing starts until you approve it.`;
}

export function estimateMessage(input: EstimateMessageInput): DocumentMessage {
  const message =
    (input.message ?? "").trim() ||
    defaultEstimateMessage(input.number, input.totalCents);

  const portalPath = estimateTokenPath(input.publicToken);

  const summary: SummaryRow[] = [
    { label: "Estimate", value: `#${input.number}` },
    { label: "Quoted", value: shortDate(input.createdAt) },
    {
      label: "Valid until",
      value: input.expiresAt ? shortDate(input.expiresAt) : "No expiry",
    },
    {
      label: "Items",
      value: `${input.lineCount} ${input.lineCount === 1 ? "line" : "lines"}`,
    },
    { label: "Estimated total", value: formatCents(input.totalCents) },
  ];

  return {
    subject:
      (input.subject ?? "").trim() ||
      defaultEstimateSubject(input.number, input.shopName),
    // No "pay" language anywhere on an estimate — there is nothing owed yet,
    // and asking for money before the work is approved is how a shop loses a
    // customer.
    emailBody: `Hi ${input.customerFirstName},\n\n${message}`,
    summary,
    smsBody: `Estimate #${input.number}: ${formatCents(
      input.totalCents,
    )}. Approve or decline online:`,
    portalPath,
    linkUrl: portalUrl(portalPath),
    context: `Estimate #${input.number}`,
  };
}

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------

export type ReceiptMessageInput = {
  shopName: string;
  customerFirstName: string;
  number: number;
  publicToken: string;
  paidAt: Date;
  method: string;
  /** The last payment — what this receipt is a receipt *for*. */
  amountCents: number;
  /** Everything collected on the invoice, net of refunds. */
  netPaidCents: number;
  totalCents: number;
  balanceCents: number;
};

export function receiptMessage(input: ReceiptMessageInput): DocumentMessage {
  const balance = Math.max(input.balanceCents, 0);
  const portalPath = invoiceTokenPath(input.publicToken);

  const summary: SummaryRow[] = [
    { label: "Invoice", value: `#${input.number}` },
    { label: "Paid on", value: shortDate(input.paidAt) },
    { label: "Method", value: input.method },
    { label: "Payment received", value: formatCents(input.amountCents) },
    { label: "Invoice total", value: formatCents(input.totalCents) },
    { label: "Remaining balance", value: formatCents(balance) },
  ];

  return {
    subject: `Receipt for invoice #${input.number} — ${input.shopName}`,
    emailBody: [
      `Hi ${input.customerFirstName},`,
      `Thank you — we've received your payment of ${formatCents(
        input.amountCents,
      )} against invoice #${input.number}.`,
      balance > 0
        ? `${formatCents(balance)} is still outstanding on this invoice.`
        : "This invoice is now paid in full. Nothing further is owed.",
    ].join("\n\n"),
    summary,
    smsBody: `Payment of ${formatCents(input.amountCents)} received for invoice #${
      input.number
    }. ${balance > 0 ? `${formatCents(balance)} still due.` : "Paid in full — thank you!"}`,
    portalPath,
    linkUrl: portalUrl(portalPath),
    context: `Receipt · Invoice #${input.number}`,
  };
}
