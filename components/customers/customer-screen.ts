import type { FilterTab } from "@/components/ui/filter-tabs";
import { invoiceCardLine, invoiceMoneyLine, overdueLabel, type CardLine, type MoneyLine } from "@/components/billing/record-format";
import { deviceName } from "@/components/tickets/repair-card-facts";
import { refundAwareTotals, type RefundLike } from "@/components/billing/refund-math";
import { formatCents } from "@/lib/money";
import { formatInZone, shortDateIn } from "@/lib/shop-time";
import { smsHref } from "./customer-facts";
import { plural } from "./format";

/**
 * Pure rules behind the Easy mode customer screen (the POS-style one): which
 * section is showing, what the summary strip says in words, what the Message
 * tile offers, and how a repair or invoice row reads. No React, no db: shared
 * by the page, the components and the tests.
 */

// ---------------------------------------------------------------------------
// Sections (the big tabs)
// ---------------------------------------------------------------------------

export const CUSTOMER_TABS = [
  { key: "repairs", label: "Repairs" },
  { key: "invoices", label: "Invoices" },
  { key: "devices", label: "Devices" },
  { key: "details", label: "Details" },
] as const;

export type CustomerTab = (typeof CUSTOMER_TABS)[number]["key"];

/** The section a `?tab=` value names, or null for anything else (a stale link, a typo). */
export function asCustomerTab(value: unknown): CustomerTab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return CUSTOMER_TABS.find((tab) => tab.key === raw)?.key ?? null;
}

/**
 * Which section to open. An explicit `?tab=` always wins. After Stripe's hosted
 * card page sends the person back (`?flash=card-saved`) the card lives under
 * Details, so that is where they land; everything else opens on Repairs, the
 * question asked at the counter most.
 */
export function resolveCustomerTab(tab: unknown, flash?: string | null): CustomerTab {
  return asCustomerTab(tab) ?? (flash?.startsWith("card-") ? "details" : "repairs");
}

/**
 * The id of the row of section tabs. Every tab links to `#sections`, so after a
 * tap the page scrolls the tab row to the top of the screen and the new list is
 * what you see (reveal-sections.tsx does the scrolling once the page is there).
 * Without it a phone stayed at the top (the header and summary fill the first
 * screen) and a tap looked like it did nothing.
 */
export const CUSTOMER_SECTIONS_ID = "sections";

/** Repairs is the default view, so it keeps the plain URL; every other section is `?tab=`. */
export function customerTabHref(customerId: string, tab: CustomerTab): string {
  const base = `/customers/${customerId}`;
  return tab === "repairs" ? base : `${base}?tab=${tab}`;
}

export function customerTabs({
  customerId,
  active,
  counts,
}: {
  customerId: string;
  active: CustomerTab;
  counts: { repairs: number; invoices: number; devices: number };
}): FilterTab[] {
  return CUSTOMER_TABS.map(({ key, label }) => ({
    label,
    href: `${customerTabHref(customerId, key)}#${CUSTOMER_SECTIONS_ID}`,
    active: key === active,
    // Details is a bundle of facts, not a list: a count would mean nothing.
    count: key === "details" ? undefined : counts[key],
  }));
}

// ---------------------------------------------------------------------------
// The summary strip
// ---------------------------------------------------------------------------

export type SummaryKey = "repairs" | "owed" | "credit" | "visit";
/** `alert` is money owed, `good` is credit on file, `muted` is "nothing here". The words carry the meaning. */
export type SummaryTone = "alert" | "good" | "muted" | "neutral";

export type SummaryItem = {
  key: SummaryKey;
  label: string;
  /** Always words ("2 open", "$27.05 owed", "Nothing owed"), never a bare number. */
  value: string;
  detail?: string;
  tone: SummaryTone;
};

/**
 * "Sep 29" this year; "Sep 29, 2025" once the year differs, so an old visit never
 * reads as a recent one. Read on the shop's calendar (`zone` is Shop.timezone).
 */
export function shortDate(date: Date, now: Date, zone?: string | null): string {
  return shortDateIn(date, now.getTime(), zone);
}

export function customerSummary({
  openRepairs,
  totalRepairs,
  owedCents,
  creditCents,
  lastVisit,
  customerSince,
  now = new Date(),
  timeZone,
}: {
  openRepairs: number;
  totalRepairs: number;
  owedCents: number;
  creditCents: number;
  lastVisit: Date | null | undefined;
  customerSince?: Date | null;
  now?: Date;
  /** The shop's time zone (Shop.timezone): dates are the shop's calendar days. */
  timeZone?: string | null;
}): SummaryItem[] {
  const visit = lastVisit && !Number.isNaN(lastVisit.getTime()) ? lastVisit : null;
  const since = customerSince && !Number.isNaN(customerSince.getTime()) ? customerSince : null;

  const repairs: SummaryItem =
    totalRepairs <= 0
      ? { key: "repairs", label: "Open repairs", value: "None yet", tone: "muted" }
      : openRepairs > 0
        ? { key: "repairs", label: "Open repairs", value: `${openRepairs} open`, detail: `${plural(totalRepairs, "repair")} in all`, tone: "neutral" }
        : { key: "repairs", label: "Open repairs", value: "None open", detail: `${plural(totalRepairs, "repair")} in all`, tone: "muted" };

  return [
    repairs,
    owedCents > 0
      ? { key: "owed", label: "Unpaid", value: `${formatCents(owedCents)} owed`, tone: "alert" }
      : { key: "owed", label: "Unpaid", value: "Nothing owed", tone: "muted" },
    creditCents > 0
      ? { key: "credit", label: "Store credit", value: `${formatCents(creditCents)} credit`, tone: "good" }
      : { key: "credit", label: "Store credit", value: "No credit", tone: "muted" },
    {
      key: "visit",
      label: "Last visit",
      value: visit ? shortDate(visit, now, timeZone) : "No visits yet",
      detail: since ? `Customer since ${formatInZone(since, "MMM d, yyyy", timeZone)}` : undefined,
      tone: visit ? "neutral" : "muted",
    },
  ];
}

// ---------------------------------------------------------------------------
// The Message tile
// ---------------------------------------------------------------------------

export type MessageOption = {
  key: "text" | "email" | "history" | "add";
  label: string;
  /** The number or address it goes to. */
  detail?: string;
  href: string;
};

/**
 * What the Message tile offers: a text to their number, an email to their
 * address, and the log of what was already sent (Details, "Messages"). With
 * neither a number nor an address the first step is to add one.
 */
export function messageOptions({
  customerId,
  phone,
  email,
}: {
  customerId: string;
  phone: string | null | undefined;
  email: string | null | undefined;
}): MessageOption[] {
  const number = phone?.trim() || null;
  const address = email?.trim() || null;
  const details = customerTabHref(customerId, "details");
  const options: MessageOption[] = [];

  if (number) options.push({ key: "text", label: "Text", detail: number, href: smsHref(number) });
  if (address) options.push({ key: "email", label: "Email", detail: address, href: `mailto:${address}` });
  if (!number && !address) options.push({ key: "add", label: "Add a phone or email", href: details });
  options.push({ key: "history", label: "Past messages", href: `${details}#messages` });
  return options;
}

// ---------------------------------------------------------------------------
// A repair row
// ---------------------------------------------------------------------------

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];

/**
 * The two lines of a repair row on the customer's own screen. The customer is
 * the page, so unlike the Repairs list the title is the job ("#1008 · Cracked
 * screen"), and the device (the picture already hints at it) is the quiet line
 * under it, left out when the subject already names it.
 */
export function repairRowLines(
  repair: { number: number; subject: string; asset?: { type: string; make?: string | null; model?: string | null } | null },
): { title: string; subtitle: string | null } {
  const subject = repair.subject.trim();
  const device = deviceName(repair.asset);
  const title = `#${repair.number} · ${subject || device || "Repair"}`;
  // No device: nothing to add. No subject: the device is already the title.
  if (!device || !subject) return { title, subtitle: null };
  const subjectWords = new Set(words(subject));
  const named = words(device).some((word) => subjectWords.has(word));
  return { title, subtitle: named ? null : device };
}

// ---------------------------------------------------------------------------
// An invoice row
// ---------------------------------------------------------------------------

export type InvoiceRowInput = {
  status: string;
  taxRateBps: number;
  createdAt: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  lines: { quantity: number; unitPriceCents: number; taxable: boolean }[];
  payments: { amountCents: number }[];
  refunds?: RefundLike[];
};

export type InvoiceRowFigures = {
  totalCents: number;
  balanceCents: number;
  overdue: string | null;
  line: CardLine;
  money: MoneyLine;
};

/** The money a customer-screen invoice row shows: total, then the balance in words ("$27.05 due", "Paid"). */
export function invoiceRowFigures(invoice: InvoiceRowInput, now: number): InvoiceRowFigures {
  const { totalCents, balanceCents } = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
  const late = invoice.status !== "VOID" ? overdueLabel(invoice.dueDate, balanceCents, now) : null;
  return {
    totalCents,
    balanceCents,
    overdue: late,
    line: invoiceCardLine({ status: invoice.status, createdAt: invoice.createdAt, dueDate: invoice.dueDate, paidAt: invoice.paidAt, balanceCents }, now),
    money: invoiceMoneyLine({ status: invoice.status, balanceCents, overdue: late !== null }),
  };
}
