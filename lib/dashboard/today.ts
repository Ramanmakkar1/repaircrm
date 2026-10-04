/**
 * The three numbers of the Home strip: takings today, owed to you, ready for
 * pickup.
 *
 * Server-only. It uses the same money queries and the same pure rules as the
 * full overview (./money, ./logic), so "Takings today" here is the figure on
 * /dashboard: today is the shop's own day, in the zone saved on the shop. A
 * technician gets null and none of the money queries run.
 */

import { db } from "@/lib/db";
import { requestNow } from "@/lib/now";
import { READY_FOR_PICKUP_STATUS } from "@/components/tickets/ticket-meta";
import { dailyTakings, safeTimeZone, summariseOwed } from "./logic";
import { canSeeMoney, loadOwedInvoices, loadTakingsRows, todayWindow } from "./money";
import type { BranchScope, DashboardUser } from "./overview";

export type TodayStripData = {
  /** `yyyy-mm-dd`, today on the shop's calendar: the day "Takings today" opens in Reports. */
  todayKey: string;
  takingsCents: number;
  owedCents: number;
  /** More unpaid invoices exist than were read: the total is "at least". */
  owedTruncated: boolean;
  readyCount: number;
};

export async function loadTodayStrip(
  user: Pick<DashboardUser, "shopId" | "role">,
  branch: BranchScope,
  nowMs: number = requestNow(),
): Promise<TodayStripData | null> {
  if (!canSeeMoney(user.role)) return null;
  const { shopId } = user;
  // The day is cut in the shop's own zone, so the zone comes first (one row by primary key).
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  const today = todayWindow(nowMs, safeTimeZone(shop?.timezone));

  const [takings, owed, readyCount] = await Promise.all([
    loadTakingsRows(shopId, branch.locationId, today.from, today.toExclusive),
    loadOwedInvoices(shopId, branch.locationId),
    db.ticket.count({ where: { shopId, ...branch, status: READY_FOR_PICKUP_STATUS } }),
  ]);

  const [day] = dailyTakings([today], takings.payments, takings.refunds);
  return {
    todayKey: today.key,
    takingsCents: day.netCents,
    owedCents: summariseOwed(owed.invoices, nowMs).totalCents,
    owedTruncated: owed.truncated,
    readyCount,
  };
}
