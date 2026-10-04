/**
 * The three numbers of the Home strip: takings today, owed to you, ready for
 * pickup.
 *
 * Server-only. It uses the same money queries and the same pure rules as the
 * full overview (./money, ./logic), so "Takings today" here is the figure on
 * /dashboard and on /reports for today, to the cent. A technician gets null
 * and none of the money queries run.
 */

import { db } from "@/lib/db";
import { requestNow } from "@/lib/now";
import { READY_FOR_PICKUP_STATUS } from "@/components/tickets/ticket-meta";
import { dailyTakings, reportDays, summariseOwed } from "./logic";
import { canSeeMoney, loadOwedInvoices, loadTakingsRows, todayWindow } from "./money";
import type { BranchScope, DashboardUser } from "./overview";

export type TodayStripData = {
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
  const today = todayWindow(nowMs);

  const [takings, owed, readyCount] = await Promise.all([
    loadTakingsRows(shopId, branch.locationId, today.from, today.toExclusive),
    loadOwedInvoices(shopId, branch.locationId),
    db.ticket.count({ where: { shopId, ...branch, status: READY_FOR_PICKUP_STATUS } }),
  ]);

  const [day] = dailyTakings(reportDays(today.from, 1), takings.payments, takings.refunds);
  return {
    takingsCents: day.netCents,
    owedCents: summariseOwed(owed.invoices, nowMs).totalCents,
    owedTruncated: owed.truncated,
    readyCount,
  };
}
