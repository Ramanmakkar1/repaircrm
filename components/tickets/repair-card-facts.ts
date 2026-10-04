/**
 * What a RepairCard says, decided in plain code so it can be tested without
 * rendering anything.
 *
 * Pure: no `db`, no `next/*`. Imported by the card, and by the Repairs page for
 * the view tabs.
 */

import { dueChip, dueDateLabel } from "@/lib/sla";
import { formatCents } from "@/lib/money";
import { progressLabel, type ChecklistProgress } from "@/lib/checklist";
import {
  asPriority,
  isReadyForPickup,
  isResolved,
  NEEDS_REPLY_FILTER,
  PRIORITY_META,
  READY_FOR_PICKUP_STATUS,
  RESOLVED_STATUS,
} from "./ticket-meta";
import { partsChipLabel } from "./part-meta";

// ---------------------------------------------------------------------------
// Due date, in words
// ---------------------------------------------------------------------------

export type DueWords = { label: string; alert: boolean };

/**
 * "Overdue 2d", "Due in 23h", "Due Oct 12". Nothing for a repair with no date
 * or one that is already closed. `alert` is true only once it is late. The date
 * is the shop's calendar date (`zone` is Shop.timezone), not the server's.
 */
export function dueWords(
  dueDate: Date | null | undefined,
  resolved: boolean,
  now: number,
  zone?: string | null,
): DueWords | null {
  const chip = dueChip(dueDate, resolved, now);
  if (!chip || !dueDate) return null;
  if (chip.tone === "later") return { label: dueDateLabel(dueDate, zone), alert: false };
  return { label: chip.label, alert: chip.tone === "overdue" };
}

// ---------------------------------------------------------------------------
// Title and subtitle
// ---------------------------------------------------------------------------

/** "Lenovo ThinkPad T14 Gen 3", or the device type when make and model are blank. */
export function deviceName(
  asset: { type: string; make?: string | null; model?: string | null } | null | undefined,
): string | null {
  if (!asset) return null;
  const head = [asset.make, asset.model].filter(Boolean).join(" ").trim();
  return head || asset.type.trim() || null;
}

const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];

/**
 * The one line under the title. The subject already names the device on most
 * repairs ("ThinkPad T14 - pop-ups..."), and saying it twice is noise; when the
 * subject is only the fault ("Cracked screen") the device is put in front so
 * the line still answers "what is it?".
 */
export function repairSubtitle(subject: string, device: string | null): string {
  const clean = subject.trim();
  if (!device) return clean;
  if (!clean) return device;
  const subjectWords = new Set(tokens(clean));
  const deviceWords = tokens(device);
  if (deviceWords.some((word) => subjectWords.has(word))) return clean;
  return `${device} · ${clean}`;
}

// ---------------------------------------------------------------------------
// The photo
// ---------------------------------------------------------------------------

const PHOTO_NAME = /(?:photo|device|intake|camera|(?:^|[_-])img[_-]?|(?:^|[_-])dsc[_-]?)/i;
const NOT_A_PHOTO = /(?:receipt|invoice|signature|barcode|logo|screenshot|estimate)/i;

/**
 * The intake photo of the device, if the repair has one: an image attachment
 * that looks like a photo of the device rather than a receipt or a signature.
 * Oldest first, so the photo taken at check-in wins over later ones.
 */
export function pickIntakePhotoId(
  attachments: readonly { id: string; fileName: string }[] | undefined,
): string | undefined {
  return attachments?.find((file) => PHOTO_NAME.test(file.fileName) && !NOT_A_PHOTO.test(file.fileName))?.id;
}

// ---------------------------------------------------------------------------
// The little facts under the subtitle
// ---------------------------------------------------------------------------

export type RepairFactKind = "priority" | "reply" | "parts" | "deposit" | "checklist";
export type RepairFact = { kind: RepairFactKind; label: string; alert?: boolean };

export type RepairFactsInput = {
  status: string;
  priority?: string | null;
  needsReply?: boolean;
  partOrders?: readonly { status: string }[];
  depositCents?: number | null;
  checklist?: ChecklistProgress | null;
};

/** Never more than this many facts under the due date; the rest fold into "+N more". */
export const MAX_FACTS = 3;

/**
 * Everything worth a chip, most urgent first: a loud priority, a customer who
 * is waiting for an answer, parts on order, money already taken, the checklist.
 */
export function repairFacts(input: RepairFactsInput): RepairFact[] {
  const facts: RepairFact[] = [];

  const priority = asPriority(input.priority);
  if (priority === "URGENT") facts.push({ kind: "priority", label: PRIORITY_META.URGENT.label, alert: true });
  else if (priority === "HIGH") facts.push({ kind: "priority", label: `${PRIORITY_META.HIGH.label} priority` });

  if (input.needsReply) facts.push({ kind: "reply", label: "Needs reply" });

  const parts = partsChipLabel(input.partOrders as { status: string }[] | undefined);
  if (parts) facts.push({ kind: "parts", label: parts });

  if (input.depositCents && input.depositCents > 0) {
    facts.push({ kind: "deposit", label: `Deposit ${formatCents(input.depositCents)}` });
  }

  if (input.checklist && input.checklist.total > 0) {
    facts.push({ kind: "checklist", label: `Checklist ${progressLabel(input.checklist)}` });
  }

  return facts;
}

export type RepairChips = {
  due: DueWords | null;
  shown: RepairFact[];
  /** "+2 more", and the words it stands for (for the hover/long-press title). */
  more: { label: string; detail: string } | null;
};

/**
 * Due date first, then at most MAX_FACTS facts. When there are more than that,
 * the first two stay and the rest fold into one "+N more" chip, so a card never
 * grows past a due date and three chips however busy the repair is.
 */
export function repairChips(
  input: RepairFactsInput & { dueDate?: Date | null },
  now: number,
  /** The shop's time zone, for the "Due Oct 12" date. */
  zone?: string | null,
): RepairChips {
  const due = dueWords(input.dueDate, isResolved(input.status), now, zone);
  const facts = repairFacts(input);
  if (facts.length <= MAX_FACTS) return { due, shown: facts, more: null };
  const shown = facts.slice(0, MAX_FACTS - 1);
  const hidden = facts.slice(MAX_FACTS - 1);
  return { due, shown, more: { label: `+${hidden.length} more`, detail: hidden.map((fact) => fact.label).join(", ") } };
}

// ---------------------------------------------------------------------------
// The view tabs on the Repairs list
// ---------------------------------------------------------------------------

export type RepairView = {
  /** Stable id for keys and tests. */
  id: string;
  label: string;
  /** The `status` search param this view sets. "open" is the default and is dropped from the URL. */
  status: string;
  /** Set only by the Overdue view: it is a due-date lens, not a status. */
  due?: "overdue";
};

export type RepairViewCounts = {
  open: number;
  all: number;
  needsReply: number;
  overdue: number;
  /** Count per exact status string. */
  byStatus: Readonly<Record<string, number>>;
};

/**
 * The tabs for Easy mode: the five views used all day first, then every other
 * status of the shop's own pipeline in its own order.
 *
 * "Ready for pickup" is only offered when the shop's pipeline actually has that
 * status, using the shop's own spelling, so the tab can never point at a status
 * that does not exist.
 */
export function repairViews(statuses: readonly string[]): RepairView[] {
  const ready = statuses.find((status) => status.trim().toLowerCase() === READY_FOR_PICKUP_STATUS.toLowerCase());
  const views: RepairView[] = [{ id: "open", label: "Open jobs", status: "open" }];
  if (ready) views.push({ id: "ready", label: "Ready for pickup", status: ready });
  views.push(
    { id: "needs-reply", label: "Needs reply", status: "needs-reply" },
    { id: "overdue", label: "Overdue", status: "open", due: "overdue" },
    { id: "all", label: "All", status: "all" },
  );
  for (const status of statuses) {
    if (status === ready) continue;
    views.push({ id: `status:${status}`, label: status, status });
  }
  return views;
}

/** The count a tab carries, or undefined when the page did not work it out. */
export function viewCount(view: RepairView, counts: RepairViewCounts | null): number | undefined {
  if (!counts) return undefined;
  if (view.due === "overdue") return counts.overdue;
  if (view.status === "open") return counts.open;
  if (view.status === "all") return counts.all;
  if (view.status === "needs-reply") return counts.needsReply;
  return counts.byStatus[view.status] ?? 0;
}

/** Which tab is lit: Overdue is a due-date lens and so wins over the status it rides on. */
export function viewIsActive(view: RepairView, current: { status: string; due: string }): boolean {
  if (view.due === "overdue") return current.due === "overdue";
  return current.due !== "overdue" && current.status === view.status;
}

/**
 * The search params a tab sets. Every other filter is kept by the page; this is
 * only what the tab itself decides. Leaving the Overdue lens for a status view
 * drops it, because the due filter would otherwise override the status picked.
 */
export function viewPatch(view: RepairView, currentDue: string): { status: string; due?: string } {
  if (view.due) return { status: view.status, due: view.due };
  return currentDue === "overdue" ? { status: view.status, due: "all" } : { status: view.status };
}

/** The same counts the tabs show, from raw rows: groupBy output plus the three extra numbers. */
export function buildViewCounts(
  byStatusRows: readonly { status: string; count: number }[],
  extra: { needsReply: number; overdue: number },
): RepairViewCounts {
  const byStatus: Record<string, number> = {};
  let all = 0;
  let resolved = 0;
  for (const row of byStatusRows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
    all += row.count;
    // Exact match, like the list's own `status: { not: "Resolved" }` filter, so a tab never promises a different number than it opens.
    if (row.status === RESOLVED_STATUS) resolved += row.count;
  }
  return { open: all - resolved, all, needsReply: extra.needsReply, overdue: extra.overdue, byStatus };
}

// ---------------------------------------------------------------------------
// The empty list
// ---------------------------------------------------------------------------

export type RepairEmpty = {
  title: string;
  hint: string;
  /** "new": check one in. "open": back to the open jobs. "clear": drop the filters. */
  action: "new" | "open" | "clear";
};

/** What an empty Repairs list says, and the one thing to do next. */
export function repairEmpty(current: { status: string; due: string; filtered: boolean }): RepairEmpty {
  if (current.status === NEEDS_REPLY_FILTER) {
    return { title: "Nobody is waiting on you", hint: "Every customer message has been answered.", action: "open" };
  }
  if (current.due === "overdue") {
    return { title: "Nothing is overdue", hint: "Every open repair is on time.", action: "open" };
  }
  if (isReadyForPickup(current.status)) {
    return { title: "Nothing is waiting for pickup", hint: "Repairs you mark Ready for pickup will show up here.", action: "open" };
  }
  if (current.filtered) {
    return { title: "No repairs match", hint: "Try another tab, or clear the search to see everything.", action: "clear" };
  }
  return { title: "No repairs yet", hint: "Tap New repair to check in the first device.", action: "new" };
}

// ---------------------------------------------------------------------------
// The one big button on a repair
// ---------------------------------------------------------------------------

/**
 * What the repair's big black button does.
 *
 * While the device is still here it is the pickup step (tell the customer it is
 * ready, then hand it over): the first thing the page has always offered. Once it
 * has gone home it is the invoice, if anything is left to bill; with nothing to
 * bill there is no big button at all rather than a dead one.
 */
export type NextStep = "pickup" | "invoice" | "none";

export function repairNextStep(state: { pickedUp: boolean; nothingToBill: boolean }): NextStep {
  if (!state.pickedUp) return "pickup";
  return state.nothingToBill ? "none" : "invoice";
}
