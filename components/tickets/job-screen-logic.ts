/**
 * What the Easy-mode repair screen decides, in plain code so it can be tested
 * without rendering anything.
 *
 * Pure: no `db`, no `next/*`. Imported by the repair page (a Server Component)
 * and by the client pieces of the screen (status row, primary button).
 */

import {
  asPriority,
  isReadyForPickup,
  isResolved,
  PRIORITY_META,
  RESOLVED_STATUS,
} from "./ticket-meta";
import { IN_PROGRESS_STATUS, WAITING_FOR_PARTS_STATUS, isTerminalPartStatus } from "./part-meta";
import { pickIntakePhotoId } from "./repair-card-facts";

// ---------------------------------------------------------------------------
// The tabs: one section at a time, in the URL
// ---------------------------------------------------------------------------

/**
 * One word each, so all five fit the left column of a counter tablet (1024px)
 * even when four of them carry a count; "Photos & files" and "Customer &
 * device" pushed Money off the edge. Each section still opens under its full
 * heading.
 */
export const JOB_TABS = [
  { id: "work", label: "Work" },
  { id: "updates", label: "Updates" },
  { id: "photos", label: "Photos" },
  { id: "customer", label: "Customer" },
  { id: "money", label: "Money" },
] as const;

export type JobTab = (typeof JOB_TABS)[number]["id"];

export const DEFAULT_JOB_TAB: JobTab = "work";

/** The `?tab=` value, or Work for anything missing or unknown (a stale link must still open). */
export function parseJobTab(value: string | string[] | undefined): JobTab {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  return JOB_TABS.find((tab) => tab.id === raw)?.id ?? DEFAULT_JOB_TAB;
}

/** What the "Add note" and "Message customer" tiles open the composer as. */
export type ComposeMode = "note" | "message";

export function parseCompose(value: string | string[] | undefined): ComposeMode | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  return raw === "note" || raw === "message" ? raw : null;
}

/** The link for a tab. Work is the default, so it keeps the plain repair URL. */
export function jobTabHref(ticketId: string, tab: JobTab, compose?: ComposeMode): string {
  const query = new URLSearchParams();
  if (tab !== DEFAULT_JOB_TAB) query.set("tab", tab);
  if (compose) query.set("compose", compose);
  const text = query.toString();
  return `/tickets/${ticketId}${text ? `?${text}` : ""}`;
}

export type JobTabCounts = {
  /** Part orders still being chased. */
  openParts: number;
  comments: number;
  attachments: number;
  charges: number;
};

/** A count only where it means something: zero parts, zero files and zero lines say nothing. */
export function jobTabCount(tab: JobTab, counts: JobTabCounts): number | undefined {
  const value =
    tab === "work" ? counts.openParts
    : tab === "updates" ? counts.comments
    : tab === "photos" ? counts.attachments
    : tab === "money" ? counts.charges
    : 0;
  return value > 0 ? value : undefined;
}

/** How many part orders are still outstanding. */
export function openPartCount(parts: readonly { status: string }[]): number {
  return parts.filter((part) => !isTerminalPartStatus(part.status)).length;
}

// ---------------------------------------------------------------------------
// The status row
// ---------------------------------------------------------------------------

/** `skipped`: a step before the current one that this repair never actually went through. */
export type StepState = "done" | "skipped" | "current" | "todo";
export type JobStep = { status: string; state: StepState };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const key = (status: string) => status.trim().toLowerCase();

/**
 * One pill per state of the shop's pipeline: the current one is filled, the
 * ones after it are still to come, and the ones before it are either done
 * (ticked) or skipped.
 *
 * `visited` is the repair's real history: every status it has been moved to
 * (the `updateType` of its status-change updates). With it, an earlier step the
 * repair jumped straight past (New to Ready for Pickup, never Waiting for Parts)
 * says "Skipped" instead of being ticked as done. The first step counts as
 * visited, because every repair is booked in there and the booking does not
 * record a status. Without a history every earlier step reads as done.
 *
 * A status the shop has since renamed away (a repair written under an old name)
 * is added at the end as the current step, so the row never claims the repair is
 * at a step it is not at.
 */
export function jobSteps(statuses: readonly string[], current: string, visited?: readonly string[]): JobStep[] {
  const list = [...statuses];
  let index = list.findIndex((status) => same(status, current));
  if (index < 0) {
    list.push(current);
    index = list.length - 1;
  }
  const been = visited ? new Set(visited.map(key)) : null;
  return list.map((status, i) => ({
    status,
    state:
      i === index ? "current"
      : i > index ? "todo"
      : !been || i === 0 || been.has(key(status)) ? "done"
      : "skipped",
  }));
}

/** A state that is not work on the bench: waiting on someone, ready to collect, or finished. */
function isWorkingStatus(status: string): boolean {
  const name = key(status);
  if (/\bwait|\bhold\b|\bpaused?\b/.test(name)) return false;
  if (isReadyForPickup(status) || same(status, RESOLVED_STATUS)) return false;
  return !/\b(closed|completed?|cancell?ed|picked up|collected|done)\b/.test(name);
}

/**
 * The state a "start", "resume" or "reopen" press moves a repair to: the shop's
 * In Progress; for a pipeline without one, the first working step (not the
 * booking-in step, not a waiting state, not ready or finished); and only when
 * there is no such step at all, the next step. Resuming from "Waiting for
 * Parts" in New / Diagnosing / Waiting for Parts / Ready / Resolved goes back to
 * Diagnosing, never on to Ready.
 */
export function inProgressTarget(statuses: readonly string[], current: string): string | null {
  const found = statuses.find((status) => same(status, IN_PROGRESS_STATUS));
  if (found) return found;
  const working = statuses.slice(1).find(isWorkingStatus);
  if (working) return working;
  const index = statuses.findIndex((status) => same(status, current));
  return statuses[index + 1] ?? null;
}

// ---------------------------------------------------------------------------
// The one big button
// ---------------------------------------------------------------------------

/**
 * Every button the big action area can show.
 *
 *   start         New -> In Progress (a plain status move, no message)
 *   ready         tell the customer and mark Ready for Pickup (the pickup notice)
 *   resume        a Waiting state -> In Progress
 *   payment       an unpaid invoice exists: open it to take the payment
 *   invoice       nothing billed yet: make the invoice (the existing dialog)
 *   handover      the customer collected it: mark picked up and close
 *   view-invoice  open the invoice
 *   reopen        move a Resolved repair back to work
 */
export type JobActionKind =
  | "start"
  | "ready"
  | "resume"
  | "payment"
  | "invoice"
  | "handover"
  | "view-invoice"
  | "reopen";

export type JobActionPair = { primary: JobActionKind | null; secondary: JobActionKind | null };

export type JobInvoice = { id: string; number: number; status: string };

/** The invoice a repair is being collected against: the newest one that is not void. */
export function pickJobInvoice<T extends { status: string }>(invoices: readonly T[]): T | null {
  return invoices.find((invoice) => invoice.status !== "VOID") ?? null;
}

/** An invoice that still has money to collect. */
export function invoiceOwes(invoice: { status: string } | null): boolean {
  return invoice !== null && ["DRAFT", "SENT", "PARTIAL"].includes(invoice.status);
}

export type JobActionInput = {
  status: string;
  /** `pickedUpAt` is stamped: the device has gone home. */
  pickedUp: boolean;
  /** Charges or billable time are still waiting to go on an invoice. */
  unbilled: boolean;
  invoice: { status: string } | null;
};

/**
 * The big button for each state, and at most one quieter button beside it.
 * Only actions the page already offers: a status move, the pickup notice,
 * mark picked up, make an invoice, open the invoice.
 */
export function jobActions(input: JobActionInput): JobActionPair {
  const { status, pickedUp, unbilled, invoice } = input;

  // The device is gone: what is left is the money.
  if (pickedUp) {
    return { primary: unbilled ? "invoice" : invoice ? "view-invoice" : null, secondary: null };
  }

  if (isResolved(status)) {
    const money: JobActionKind | null = unbilled ? "invoice" : invoice ? "view-invoice" : null;
    return money ? { primary: money, secondary: "reopen" } : { primary: "reopen", secondary: null };
  }

  if (isReadyForPickup(status)) {
    if (invoiceOwes(invoice)) return { primary: "payment", secondary: "handover" };
    if (unbilled) return { primary: "invoice", secondary: "handover" };
    return { primary: "handover", secondary: invoice ? "view-invoice" : null };
  }

  if (same(status, "New")) return { primary: "start", secondary: null };
  if (same(status, "Waiting on Customer") || same(status, WAITING_FOR_PARTS_STATUS)) {
    return { primary: "resume", secondary: null };
  }
  // In Progress, and any state a shop invented: the next real step is finishing.
  return { primary: "ready", secondary: null };
}

export type JobActionCopy = {
  label: string;
  /** One quiet line under the button, saying what pressing it does. */
  hint?: string;
};

/** Plain words for each button. */
export function jobActionCopy(
  kind: JobActionKind,
  context: { customerName?: string; invoiceNumber?: number | null; inProgress?: string } = {},
): JobActionCopy {
  const who = context.customerName?.trim() || "the customer";
  switch (kind) {
    case "start":
      return { label: "Start repair", hint: `Moves this repair to ${context.inProgress ?? IN_PROGRESS_STATUS}.` };
    case "ready":
      return { label: "Mark ready for pickup", hint: `Tells ${who} by text or email.` };
    case "resume":
      return { label: "Resume repair", hint: `Moves this repair back to ${context.inProgress ?? IN_PROGRESS_STATUS}.` };
    case "payment":
      return {
        label: "Take payment",
        hint: context.invoiceNumber ? `Opens invoice #${context.invoiceNumber}.` : "Opens the invoice.",
      };
    case "invoice":
      return { label: "Make invoice", hint: "Then take payment on the invoice." };
    case "handover":
      return { label: "Hand over to customer", hint: "Marks it picked up and closes the repair." };
    case "view-invoice":
      return { label: context.invoiceNumber ? `View invoice #${context.invoiceNumber}` : "View invoice" };
    case "reopen":
      return { label: "Reopen repair", hint: "Moves it back to work." };
  }
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

/** "tel:" and "sms:" links and the number as written, or null when there is nothing to dial. */
export function phoneLinks(phone: string | null | undefined): { display: string; tel: string; sms: string } | null {
  const display = phone?.trim();
  if (!display) return null;
  const digits = display.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return { display, tel: `tel:${digits}`, sms: `sms:${digits}` };
}

/** "Low priority", "Urgent priority": the word, never only a dot. */
export function priorityWords(priority: string | null | undefined): string {
  return `${PRIORITY_META[asPriority(priority)].label} priority`;
}

/**
 * The intake photo of the device: an image the shop took at check-in. The list
 * arrives newest first (the Photos tab wants it that way); the picker wants the
 * oldest first, and only images.
 */
export function intakePhotoId(
  attachments: readonly { id: string; fileName: string; mimeType: string }[],
): string | undefined {
  const images = attachments.filter((file) => file.mimeType.startsWith("image/")).reverse();
  return pickIntakePhotoId(images);
}

/** Where a status the shop calls "Ready for Pickup" or "Resolved" sits, for the shortcut blocks in the status sheet. */
export function sheetShortcut(
  target: string,
  current: string,
  pickedUp: boolean,
): "notify" | "handover" | null {
  if (same(target, current)) return null;
  if (isReadyForPickup(target)) return "notify";
  if (same(target, RESOLVED_STATUS) && isReadyForPickup(current) && !pickedUp) return "handover";
  return null;
}
