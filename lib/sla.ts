/**
 * Response targets — how long a ticket of each priority may sit before it is
 * late, and how that lateness is described on screen.
 *
 * Pure — imported by both Server Components and the ticket cards in the
 * browser, so no `db`, no `next/*`, no "use server".
 *
 * The hours are CALENDAR hours, not business hours: a shop that closes at six
 * still has a customer waiting overnight, and pretending otherwise would make
 * "Due in 5h" a lie. The Workflow tab says so next to the inputs.
 */

import { PRIORITIES, type PriorityKey } from "@/components/tickets/ticket-meta";

/** Shipped defaults, used until a shop sets its own in Settings → Workflow. */
export const DEFAULT_SLA_HOURS: Record<PriorityKey, number> = {
  LOW: 120,
  NORMAL: 72,
  HIGH: 24,
  URGENT: 4,
};

/** Nobody promises a repair in under an hour, and a year is not a target. */
export const MIN_SLA_HOURS = 1;
export const MAX_SLA_HOURS = 8760;

export type SlaHours = Record<PriorityKey, number>;

/**
 * Reads `Shop.settings.sla`, tolerating every shape the Json column can
 * legally hold (null, a scalar, an array, an object with junk in it). Any
 * priority the blob does not answer for falls back to the default.
 */
export function readSla(settings: unknown): SlaHours {
  const out = { ...DEFAULT_SLA_HOURS };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return out;
  }
  const raw = (settings as Record<string, unknown>).sla;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  for (const priority of PRIORITIES) {
    const value = (raw as Record<string, unknown>)[priority];
    const hours = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(hours) && hours >= MIN_SLA_HOURS && hours <= MAX_SLA_HOURS) {
      out[priority] = Math.round(hours);
    }
  }
  return out;
}

/** Hours this shop allows itself for a ticket of `priority`. */
export function slaHours(settings: unknown, priority: PriorityKey): number {
  return readSla(settings)[priority];
}

/** `now` + the shop's target for this priority — the implied due date. */
export function slaDueDate(
  settings: unknown,
  priority: PriorityKey,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + slaHours(settings, priority) * 3_600_000);
}

// ---------------------------------------------------------------------------
// The due chip
// ---------------------------------------------------------------------------

/**
 * How a due date reads on a card.
 *
 *   overdue   past due            red     "Overdue 2d"
 *   soon      due within 24h      amber   "Due in 5h"
 *   later     further out         grey    "Due Aug 30"
 *
 * A resolved ticket has no chip at all: the job is done, and shouting about a
 * date it beat (or missed) helps nobody looking at a board of live work.
 */
export type DueTone = "overdue" | "soon" | "later";

export type DueChip = { tone: DueTone; label: string };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "2d", "5h", "20m" — the compact span the chip carries. */
function spanShort(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(ms / DAY_MS)}d`;
}

export function dueChip(
  dueDate: Date | string | null | undefined,
  resolved: boolean,
  now: number = Date.now(),
): DueChip | null {
  if (!dueDate || resolved) return null;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return null;

  if (due < now) return { tone: "overdue", label: `Overdue ${spanShort(now - due)}` };
  if (due - now <= DAY_MS) return { tone: "soon", label: `Due in ${spanShort(due - now)}` };
  return { tone: "later", label: "" };
}

/** Chip classes per tone, reusing the app's status tokens. */
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "bg-status-overdue-bg font-bold text-status-overdue-fg",
  soon: "bg-status-in-progress-bg font-semibold text-status-in-progress-fg",
  later: "",
};
