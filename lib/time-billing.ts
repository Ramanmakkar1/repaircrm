import { format } from "date-fns";
import type { Prisma } from "@prisma/client";

import {
  labourAmountCents,
  labourDescription,
  roundSecondsUp,
  type LabourSettings,
} from "@/lib/labour";

/**
 * Billing the clock.
 *
 * A `TimeEntry` is billable time until somebody says otherwise (`billable`),
 * and it is *billed* once it carries an `invoiceId`. This module turns the
 * unbilled-and-billable set into invoice lines and is the only place that
 * conversion happens — the ticket → invoice action and the "add to invoice"
 * banner both call it, so a labour line raised from either route is priced and
 * worded identically.
 *
 * A plain server module, NOT a `"use server"` file: it is reached only through
 * actions that have already resolved `shopId` from the session.
 */

type Tx = Prisma.TransactionClient;

export type BillableTimeEntry = {
  id: string;
  seconds: number;
  startedAt: Date;
  userName: string;
};

/**
 * The entries on a ticket that could go onto an invoice right now: billable,
 * not already billed, and actually stopped (a running timer has no duration
 * yet, and billing "0:00" would be a lie the tech has to go and correct).
 */
export async function loadBillableTime(
  client: Tx,
  shopId: string,
  ticketId: string,
): Promise<BillableTimeEntry[]> {
  const rows = await client.timeEntry.findMany({
    where: {
      shopId,
      ticketId,
      billable: true,
      invoiceId: null,
      endedAt: { not: null },
      seconds: { gt: 0 },
    },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      seconds: true,
      startedAt: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    seconds: row.seconds ?? 0,
    startedAt: row.startedAt,
    userName: row.user.name,
  }));
}

/** Raw logged seconds — what the tech actually sat there for. */
export function totalSeconds(entries: readonly BillableTimeEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.seconds, 0);
}

/** What those entries will bill as once each one is rounded up on its own. */
export function billableSeconds(
  entries: readonly BillableTimeEntry[],
  labour: LabourSettings,
): number {
  return entries.reduce(
    (sum, entry) => sum + roundSecondsUp(entry.seconds, labour.roundingMinutes),
    0,
  );
}

export function billableAmountCents(
  entries: readonly BillableTimeEntry[],
  labour: LabourSettings,
): number {
  return entries.reduce(
    (sum, entry) => sum + labourAmountCents(entry.seconds, labour),
    0,
  );
}

export type LabourLine = {
  productId: null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

/**
 * One line per entry, not one merged "Labour" line.
 *
 * A customer looking at a $470 bill wants to see the three visits that made it
 * up, and the shop wants to be able to strike one of them without recomputing
 * the rest. Quantity is always 1: the hours are already priced into the unit
 * amount, so a quantity of 1.5 (which the schema cannot hold anyway) never has
 * to be invented.
 *
 * Labour is taxable — services are taxed in every jurisdiction this app ships
 * to; a shop that disagrees marks the customer exempt or edits the line.
 */
export function labourLinesFor(
  entries: readonly BillableTimeEntry[],
  labour: LabourSettings,
): LabourLine[] {
  return entries.map((entry) => ({
    productId: null,
    description: labourDescription(
      entry.userName,
      format(entry.startedAt, "MMM d"),
      entry.seconds,
      labour.roundingMinutes,
    ),
    quantity: 1,
    unitPriceCents: labourAmountCents(entry.seconds, labour),
    taxable: true,
  }));
}
