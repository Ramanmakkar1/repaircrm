/**
 * Shared vocabulary for part orders ("Part Order / Parts Status").
 *
 * Imported by BOTH the server actions and the client card, so — like
 * ticket-meta.ts — this file must stay pure: no `db`, no `next/*`, no
 * "use server".
 */

import type { StatusTone } from "@/components/ui/badge";
import type { ActionState } from "./action-state";

export const PART_STATUSES = [
  "NEEDED",
  "ORDERED",
  "RECEIVED",
  "CANCELED",
] as const;

export type PartStatus = (typeof PART_STATUSES)[number];

/**
 * RECEIVED and CANCELED are terminal: a part that arrived on the bench or was
 * called off has left the sourcing pipeline, and re-opening it would desync the
 * stock movement that receiving already wrote. Order another one instead.
 */
export const TERMINAL_PART_STATUSES: readonly PartStatus[] = [
  "RECEIVED",
  "CANCELED",
];

export function isTerminalPartStatus(status: string): boolean {
  return TERMINAL_PART_STATUSES.includes(status as PartStatus);
}

/** The statuses that still count as "this ticket is waiting on a part". */
export const OPEN_PART_STATUSES: readonly PartStatus[] = ["NEEDED", "ORDERED"];

/**
 * Where each part-order state sits in the app-wide tone language (see
 * `components/ui/badge.tsx`): grey while it is only a wish, amber once money
 * is committed, green when it is on the shelf, struck when it was called off.
 */
export const PART_STATUS_META: Record<
  PartStatus,
  { label: string; tone: StatusTone; struck?: boolean }
> = {
  NEEDED: { label: "Needed", tone: "neutral" },
  ORDERED: { label: "Ordered", tone: "active" },
  RECEIVED: { label: "Received", tone: "success" },
  CANCELED: { label: "Canceled", tone: "neutral", struck: true },
};

export function asPartStatus(value: unknown): PartStatus {
  return PART_STATUSES.includes(value as PartStatus)
    ? (value as PartStatus)
    : "NEEDED";
}

/** The ticket status a part order is meant to unblock. */
export const WAITING_FOR_PARTS_STATUS = "Waiting for Parts";
export const IN_PROGRESS_STATUS = "In Progress";

/**
 * What a part-order transition returns.
 *
 * `offerResume` is the one extra bit: receiving a part on a ticket that is
 * parked in "Waiting for Parts" *offers* to move it to "In Progress". It is
 * deliberately an offer, not an automatic move — the bench may still be waiting
 * on a second part, and a status that changes itself under a tech is worse than
 * one they have to click.
 */
export type PartActionState = ActionState & { offerResume?: boolean };

/**
 * Short label for the tickets-list chip, e.g. "Parts: 2 ordered".
 * Returns null when nothing is outstanding, so the card renders no chip at all.
 */
export function partsChipLabel(
  parts: readonly { status: string }[] | undefined,
): string | null {
  if (!parts || parts.length === 0) return null;

  let ordered = 0;
  let needed = 0;
  for (const part of parts) {
    if (part.status === "ORDERED") ordered += 1;
    else if (part.status === "NEEDED") needed += 1;
  }

  const bits: string[] = [];
  if (ordered > 0) bits.push(`${ordered} ordered`);
  if (needed > 0) bits.push(`${needed} needed`);
  return bits.length > 0 ? `Parts: ${bits.join(", ")}` : null;
}
