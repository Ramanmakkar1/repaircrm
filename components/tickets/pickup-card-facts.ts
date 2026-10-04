/**
 * What the pickup counter says, decided in plain code so it can be tested
 * without rendering anything.
 *
 * Pure: no `db`, no `next/*`. Imported by the PickupCard, the pickup view of the
 * Repairs page and the confirm dialogs.
 *
 * The money here is the same money the invoice page shows: it goes through
 * `refundAwareTotals` (which wraps `invoiceTotals` / `calcTotals` in lib/money.ts
 * and subtracts refunds), so a card never says "Paid in full" over an invoice
 * whose own page says "Partial".
 */

import { differenceInCalendarDays, format } from "date-fns";

import { primaryPhone } from "@/components/customers/customer-facts";
import { refundAwareTotals, type RefundLike } from "@/components/billing/refund-math";
import { formatCents, type LineLike } from "@/lib/money";
import { isReadyForPickup } from "./ticket-meta";

// ---------------------------------------------------------------------------
// Which Repairs views are the pickup counter
// ---------------------------------------------------------------------------

/**
 * The dedicated pickup counter replaces the list only for the plain Ready for
 * pickup view. The Overdue / Due today lenses override the status filter in the
 * query (see the Repairs page), so under them the list is not "ready repairs"
 * any more and the ordinary cards stay.
 */
export function isPickupView(current: { status: string; due: string }): boolean {
  return isReadyForPickup(current.status) && current.due === "all";
}

const SEARCH_DEFAULTS: Record<string, string> = { tech: "all", problemType: "all", sort: "created" };

/**
 * The hidden inputs the big search box posts besides the words typed in it, so
 * searching never drops the view or a filter set earlier (a customer's repairs,
 * one technician). Defaults are left out to keep the URL clean.
 */
export function pickupSearchFields(filters: {
  status: string;
  tech: string;
  problemType: string;
  sort: string;
  customerId: string;
}): [string, string][] {
  const fields: [string, string][] = [["status", filters.status]];
  for (const key of ["tech", "problemType", "sort"] as const) {
    if (filters[key] !== SEARCH_DEFAULTS[key]) fields.push([key, filters[key]]);
  }
  if (filters.customerId) fields.push(["customerId", filters.customerId]);
  return fields;
}

// ---------------------------------------------------------------------------
// Ready since, in words
// ---------------------------------------------------------------------------

export type ReadySince = {
  label: string;
  /** True once the device has been waiting two weeks or more: worth a nudge. */
  long: boolean;
};

/**
 * "Ready today", "Ready since yesterday", "Ready since Tuesday" (within the
 * week), then a date ("Ready since Sep 18 · 15 days"). Counted in calendar days
 * so a device finished at 11pm last night is "yesterday", not "today".
 */
export function readySince(since: Date | null | undefined, now: number): ReadySince {
  if (!since || Number.isNaN(since.getTime())) return { label: "Ready for pickup", long: false };

  const days = differenceInCalendarDays(now, since);
  if (days <= 0) return { label: "Ready today", long: false };
  if (days === 1) return { label: "Ready since yesterday", long: false };
  if (days < 7) return { label: `Ready since ${format(since, "EEEE")}`, long: false };

  const sameYear = since.getFullYear() === new Date(now).getFullYear();
  const date = format(since, sameYear ? "MMM d" : "MMM d, yyyy");
  return { label: `Ready since ${date} · ${days} days`, long: days >= 14 };
}

// ---------------------------------------------------------------------------
// The money block
// ---------------------------------------------------------------------------

export type PickupInvoice = {
  id: string;
  number: number;
  status: string;
  taxRateBps: number;
  lines: readonly LineLike[];
  payments: readonly { amountCents: number }[];
  refunds?: readonly RefundLike[];
};

/**
 * "due": an invoice is open. "paid": every invoice is settled and nothing is
 * waiting. "unbilled": every invoice is settled, but charges added since sit on
 * no invoice, so the money is NOT sorted out. "none": no invoice at all.
 */
export type PickupMoneyKind = "due" | "paid" | "unbilled" | "none";

export type PickupMoney = {
  kind: PickupMoneyKind;
  /** The words: "Balance due", "Paid in full", "Paid, but 2 charges not billed yet", "Nothing owed" or "No invoice yet". */
  label: string;
  /** What is still owed. Zero unless `kind` is "due". */
  dueCents: number;
  /** One quiet line under the label: which invoice, what is paid, what is waiting to be billed. */
  detail: string;
  /** The invoice the counter opens to take the money: the one owing most. Null with no invoice. */
  invoiceId: string | null;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Where the repair stands on money, from its invoices.
 *
 * Voided invoices are ignored (they are not a debt). Every other one counts,
 * a draft included: the customer will owe it as soon as it goes out. A repair
 * with several invoices owes the sum of what is still open on them; an
 * overpaid one never offsets another's balance.
 */
export function pickupMoney(
  invoices: readonly PickupInvoice[],
  extra: { unbilledCharges?: number; depositCents?: number | null } = {},
): PickupMoney {
  const live = invoices.filter((invoice) => invoice.status !== "VOID");
  // Charges on no invoice. `addChargeAction` never looks at invoices, so these
  // can pile up behind a paid one: every branch below has to say so.
  const waiting = Math.max(0, Math.round(extra.unbilledCharges ?? 0)) || 0;
  const notBilled = `${plural(waiting, "charge")} not billed yet`;

  if (live.length === 0) {
    const deposit = extra.depositCents && extra.depositCents > 0 ? `Deposit ${formatCents(extra.depositCents)} held` : null;
    const first = waiting > 0 ? notBilled : "Nothing billed on this repair yet";
    return {
      kind: "none",
      label: "No invoice yet",
      dueCents: 0,
      detail: [first, deposit].filter(Boolean).join(" · "),
      invoiceId: null,
    };
  }

  const rows = live.map((invoice) => ({
    invoice,
    totals: refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds ?? []),
  }));
  const owing = rows.filter((row) => row.totals.balanceCents > 0);

  if (owing.length > 0) {
    const dueCents = owing.reduce((sum, row) => sum + row.totals.balanceCents, 0);
    const lead = owing.reduce((best, row) => (row.totals.balanceCents > best.totals.balanceCents ? row : best));
    let detail: string;
    if (owing.length === 1) {
      const { totals, invoice } = lead;
      detail =
        totals.netPaidCents > 0
          ? `Invoice #${invoice.number} · ${formatCents(totals.netPaidCents)} of ${formatCents(totals.totalCents)} paid`
          : `Invoice #${invoice.number} · ${formatCents(totals.totalCents)} total`;
    } else {
      detail = `${owing.length} invoices still open`;
    }
    if (waiting > 0) detail = `${detail} · ${notBilled}`;
    return { kind: "due", label: "Balance due", dueCents, detail, invoiceId: lead.invoice.id };
  }

  const billed = rows.reduce((sum, row) => sum + row.totals.totalCents, 0);
  const paid = rows.reduce((sum, row) => sum + row.totals.netPaidCents, 0);
  const over = rows.reduce((sum, row) => sum + Math.max(0, -row.totals.balanceCents), 0);
  const subject = live.length === 1 ? `Invoice #${live[0].number}` : `${live.length} invoices`;
  const detail =
    billed > 0
      ? `${subject} · ${formatCents(paid)} paid${over > 0 ? ` · overpaid by ${formatCents(over)}` : ""}`
      : `${subject} · no charge`;
  if (waiting > 0) {
    // Settled, but not finished: never the green "Paid in full".
    return {
      kind: "unbilled",
      label: billed > 0 ? `Paid, but ${notBilled}` : notBilled,
      dueCents: 0,
      detail,
      invoiceId: live[0].id,
    };
  }
  return {
    kind: "paid",
    label: billed > 0 ? "Paid in full" : "Nothing owed",
    dueCents: 0,
    detail,
    invoiceId: live[0].id,
  };
}

// ---------------------------------------------------------------------------
// The one big button, and the small ones
// ---------------------------------------------------------------------------

/**
 * "pay": open the invoice to take the money. "handover": give the device back.
 * "invoice": something is not on an invoice (no invoice yet, or charges added
 * after a settled one), so make one. "open": no invoice and nothing to bill, so
 * the repair is where to go next.
 */
export type PickupPrimary = "pay" | "handover" | "invoice" | "open";

export type PickupPlan = {
  primary: PickupPrimary;
  /** The quiet "Open repair" next to the big button (when it is not the big button itself). */
  openRepair: boolean;
  /** Handing over before the money is sorted out: allowed, never the front button. */
  handOverAnyway: boolean;
};

export function pickupPlan(money: PickupMoney, canInvoice: boolean): PickupPlan {
  if (money.kind === "due") return { primary: "pay", openRepair: true, handOverAnyway: true };
  if (money.kind === "paid") return { primary: "handover", openRepair: true, handOverAnyway: false };
  // Settled, but charges are waiting to be billed: collect that before the device goes.
  if (money.kind === "unbilled") return { primary: "invoice", openRepair: true, handOverAnyway: true };
  if (canInvoice) return { primary: "invoice", openRepair: true, handOverAnyway: true };
  return { primary: "open", openRepair: false, handOverAnyway: true };
}

// ---------------------------------------------------------------------------
// Words for the dialogs and toasts
// ---------------------------------------------------------------------------

/** "Hand #1008 over to Owen Fitzgerald?" */
export function handOverQuestion(number: number, customerName: string): string {
  return `Hand #${number} over to ${customerName}?`;
}

/**
 * The sentence under the question: what the press does, and the money warning
 * when there is one. `unbilledCharges` is the card's count of charges on no
 * invoice; they are named whatever the invoices say.
 */
export function handOverNote(money: PickupMoney, unbilledCharges = 0): string {
  const closes = "This closes the repair and marks the device as collected.";
  const waiting = Math.max(0, Math.round(unbilledCharges)) || 0;
  const unbilled = waiting > 0 ? `${plural(waiting, "charge")} ${waiting === 1 ? "is" : "are"} not billed yet.` : "";
  const owes =
    money.kind === "due"
      ? `They still owe ${formatCents(money.dueCents)}.`
      : money.kind === "none"
        ? "There is no invoice on this repair."
        : "";
  return [owes, unbilled, closes].filter(Boolean).join(" ");
}

export function handedOverMessage(number: number, customerName: string): string {
  return `#${number} handed over to ${customerName}.`;
}

/** "Create an invoice for #1008?" */
export function invoiceQuestion(number: number): string {
  return `Create an invoice for #${number}?`;
}

export function invoiceNote(unbilledCharges: number): string {
  const count = Math.max(0, Math.round(unbilledCharges));
  return `${plural(count, "charge")} not billed yet go${count === 1 ? "es" : ""} onto a new invoice, with any unbilled time. You can take payment on it straight away.`;
}

// ---------------------------------------------------------------------------
// The header and the empty view
// ---------------------------------------------------------------------------

/** "3 waiting", or "2 matches" while a search is on. */
export function pickupCountWords(total: number, searching: boolean): string {
  return searching ? plural(total, "match", "matches") : `${total} waiting`;
}

/** "$120.00 to collect" for the money still owed on these cards, or null when there is none. */
export function toCollectWords(moneys: readonly PickupMoney[]): string | null {
  const cents = moneys.reduce((sum, money) => sum + money.dueCents, 0);
  return cents > 0 ? `${formatCents(cents)} to collect` : null;
}

export type PickupEmpty = {
  title: string;
  hint: string;
  /** "repairs": back to the Repairs list. "clear": drop the search. */
  action: "repairs" | "clear";
};

/** What an empty pickup counter says. A search that finds nothing is not the same as an empty shelf. */
export function pickupEmpty(q: string): PickupEmpty {
  const words = q.trim();
  if (words) {
    return {
      title: `Nothing ready matches "${words}"`,
      hint: "Check the name, phone or number, or clear the search to see everything waiting.",
      action: "clear",
    };
  }
  return {
    title: "Nothing is waiting for pickup",
    hint: "Repairs you mark Ready for pickup will show up here.",
    action: "repairs",
  };
}

// ---------------------------------------------------------------------------
// One card, from what the list and the details query loaded
// ---------------------------------------------------------------------------

/** The repair as the Repairs list loaded it. */
export type PickupTicket = {
  id: string;
  number: number;
  subject: string;
  customer: { firstName: string; lastName: string; businessName?: string | null };
  asset?: { type: string; make?: string | null; model?: string | null } | null;
  attachments?: { id: string; fileName: string }[];
  depositCents?: number | null;
  updatedAt: Date;
};

export type PickupCardData = {
  id: string;
  number: number;
  subject: string;
  customer: PickupTicket["customer"];
  asset?: PickupTicket["asset"];
  attachments?: PickupTicket["attachments"];
  /** The number a tap dials: their mobile when there is one, else the office phone. */
  phone: string | null;
  /** When the repair moved to Ready for pickup; the last update when that is not on record. */
  readySince: Date | null;
  money: PickupMoney;
  /** Charges nobody has put on an invoice yet. */
  unbilledCharges: number;
};

export type PickupDetails = {
  id: string;
  customer?: { phone: string | null; mobile: string | null } | null;
  comments?: { createdAt: Date }[];
  invoices?: PickupInvoice[];
  _count?: { charges: number };
};

/** Pure: one list row plus its details becomes one card. Missing details read as "none". */
export function toPickupCard(ticket: PickupTicket, details: PickupDetails | undefined): PickupCardData {
  const unbilledCharges = details?._count?.charges ?? 0;
  const phone = details?.customer ? primaryPhone(details.customer).value.trim() || null : null;
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    customer: ticket.customer,
    asset: ticket.asset,
    attachments: ticket.attachments,
    phone,
    readySince: details?.comments?.[0]?.createdAt ?? ticket.updatedAt ?? null,
    money: pickupMoney(details?.invoices ?? [], { unbilledCharges, depositCents: ticket.depositCents }),
    unbilledCharges,
  };
}
