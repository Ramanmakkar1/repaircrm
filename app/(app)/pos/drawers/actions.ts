"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newRecordLocationId } from "@/lib/location";
import type { DrawerSummary } from "@/components/pos/drawer-types";

/**
 * The cash drawer: open a float, close a count.
 *
 * Every action re-derives `shopId` from the session and scopes the drawer to it
 * — a drawer id that arrived over the wire is only ever a filter.
 *
 * WHAT "EXPECTED" MEANS, EXACTLY
 * ------------------------------
 *     opening float
 *   + CASH payments   taken since the drawer opened
 *   + CASH deposits   taken since the drawer opened (another builder writes
 *                     these rows; this module only ever READS them)
 *   - CASH refunds    given since the drawer opened
 *
 * Card, cheque and store-credit tenders are deliberately absent: they never
 * touch the till, so counting them would guarantee a shortfall every night.
 *
 * A session belongs to the BRANCH the register is standing in, resolved the
 * same way every other new record resolves it (lib/location.ts). Two counters
 * in two branches therefore each keep their own float and their own takings;
 * "all locations" selected in the top bar opens the shop's default branch,
 * because a till is a physical thing and has to be somewhere.
 */

export type DrawerResult = { ok: true } | { ok: false; error: string };

const MAX_CENTS = 100_000_00; // $100,000 — a counter float, not a vault.

function clampCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), MAX_CENTS));
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/**
 * Starts a session with the float that is physically in the till.
 *
 * Refuses when one is already open rather than stacking a second: two open
 * drawers would each claim the same takings, and every count from then on would
 * be wrong in a way nobody could reconstruct.
 */
export async function openDrawerAction(
  openingCents: number,
): Promise<DrawerResult> {
  const { shopId, userId } = await requireUser();
  const locationId = await newRecordLocationId(shopId, userId);

  const open = await db.cashDrawerSession.findFirst({
    where: { shopId, locationId, closedAt: null },
    select: { id: true },
  });
  if (open) return { ok: false, error: "A drawer is already open." };

  await db.cashDrawerSession.create({
    data: {
      shopId,
      locationId,
      openedById: userId,
      openingCents: clampCents(openingCents),
    },
  });

  revalidatePath("/pos");
  revalidatePath("/pos/drawers");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * What the drawer should hold right now, and where each part came from.
 *
 * Called by the close dialog when it opens rather than baked into the POS page
 * render: a counter can sit on /pos for an hour taking sales, and an expected
 * total computed at page load would be an hour stale by the time anybody counts.
 */
export async function getDrawerSummaryAction(
  drawerId: string,
): Promise<{ ok: true; summary: DrawerSummary } | { ok: false; error: string }> {
  const { shopId } = await requireUser();

  const drawer = await db.cashDrawerSession.findFirst({
    where: { id: drawerId, shopId },
    select: { id: true, openedAt: true, openingCents: true, closedAt: true },
  });
  if (!drawer) return { ok: false, error: "That drawer no longer exists." };

  const summary = await summarise(shopId, drawer);
  return { ok: true, summary };
}

/** Shared by the close action and the summary read, so they cannot disagree. */
async function summarise(
  shopId: string,
  drawer: { openedAt: Date; openingCents: number; closedAt: Date | null },
): Promise<DrawerSummary> {
  // A closed drawer is measured over the window it was actually open for;
  // a live one runs to now.
  const window = {
    gte: drawer.openedAt,
    ...(drawer.closedAt ? { lte: drawer.closedAt } : {}),
  };

  const [payments, deposits, refunds] = await Promise.all([
    db.payment.aggregate({
      where: { shopId, method: "CASH", createdAt: window },
      _sum: { amountCents: true },
      _count: true,
    }),
    db.deposit.aggregate({
      where: { shopId, method: "CASH", refundedAt: null, createdAt: window },
      _sum: { amountCents: true },
      _count: true,
    }),
    db.refund.aggregate({
      where: { shopId, method: "CASH", createdAt: window },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);

  const paymentsCents = payments._sum.amountCents ?? 0;
  const depositsCents = deposits._sum.amountCents ?? 0;
  const refundsCents = refunds._sum.amountCents ?? 0;

  return {
    openingCents: drawer.openingCents,
    paymentsCents,
    paymentsCount: payments._count,
    depositsCents,
    depositsCount: deposits._count,
    refundsCents,
    refundsCount: refunds._count,
    expectedCents:
      drawer.openingCents + paymentsCents + depositsCents - refundsCents,
  };
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

/**
 * Closes the session with what was actually counted.
 *
 * `expectedCents` is recomputed HERE rather than trusted from the dialog: the
 * number the browser was shown is a display, and a drawer report is the shop's
 * own record of a discrepancy. The difference is left to be derived from the
 * two stored figures — storing it as a third column would be a fact that could
 * drift from the two it came from.
 */
export async function closeDrawerAction(
  drawerId: string,
  input: { countedCents: number; note: string },
): Promise<DrawerResult> {
  const { shopId, userId } = await requireUser();

  const drawer = await db.cashDrawerSession.findFirst({
    where: { id: drawerId, shopId, closedAt: null },
    select: { id: true, openedAt: true, openingCents: true, closedAt: true },
  });
  if (!drawer) return { ok: false, error: "That drawer is already closed." };

  const summary = await summarise(shopId, drawer);

  await db.cashDrawerSession.update({
    where: { id: drawer.id },
    data: {
      closedAt: new Date(),
      closedById: userId,
      expectedCents: summary.expectedCents,
      countedCents: clampCents(input.countedCents),
      note: input.note.trim().slice(0, 500) || null,
    },
  });

  revalidatePath("/pos");
  revalidatePath("/pos/drawers");
  return { ok: true };
}
