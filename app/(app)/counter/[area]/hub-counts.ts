/**
 * The live numbers on a hub's picture tiles ("5 unpaid", "2 ready"), so the
 * owner learns what is waiting without opening each list. Server-only.
 *
 * Only the counts the hub's own tiles ask for are run, every query is scoped
 * to the session's shop (and the chosen branch where the record has one), and
 * money counts never run for a technician. Each number matches the list its
 * tile opens.
 */

import { db } from "@/lib/db";
import { reportDays } from "@/lib/dashboard/logic";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { READY_FOR_PICKUP_STATUS, RESOLVED_STATUS } from "@/components/tickets/ticket-meta";
import type { HubCountKey, WorkspaceAction } from "@/lib/touch-workspace";

export type HubCounts = Partial<Record<HubCountKey, number>>;

const MONEY: ReadonlySet<HubCountKey> = new Set(["invoices-unpaid", "invoices-partial", "recurring-active", "estimates-open", "drawers-open"]);

export function hubCountKeys(actions: readonly WorkspaceAction[], role: string): HubCountKey[] {
  const keys = new Set<HubCountKey>();
  for (const action of actions) {
    if (action.count && (role !== "TECH" || !MONEY.has(action.count))) keys.add(action.count);
  }
  return [...keys];
}

export async function loadHubCounts(
  keys: readonly HubCountKey[],
  user: { shopId: string },
  branch: { locationId?: string },
  nowMs: number,
): Promise<HubCounts> {
  if (keys.length === 0) return {};
  const { shopId } = user;
  const where = branch.locationId ? { shopId, locationId: branch.locationId } : { shopId };
  const now = new Date(nowMs);

  const run: Record<HubCountKey, () => Promise<number>> = {
    "repairs-open": () => db.ticket.count({ where: { ...where, NOT: { status: RESOLVED_STATUS } } }),
    "repairs-ready": () => db.ticket.count({ where: { ...where, status: READY_FOR_PICKUP_STATUS } }),
    "repairs-overdue": () => db.ticket.count({ where: { ...where, NOT: { status: RESOLVED_STATUS }, dueDate: { lt: now } } }),
    "invoices-unpaid": () => db.invoice.count({ where: { ...where, status: { in: ["SENT", "PARTIAL"] } } }),
    "invoices-partial": () => db.invoice.count({ where: { ...where, status: "PARTIAL" } }),
    "recurring-active": () => db.recurringInvoice.count({ where: { shopId, active: true } }),
    // Estimates belong to the shop, not a branch.
    "estimates-open": () => db.estimate.count({ where: { shopId, status: { in: ["DRAFT", "SENT"] } } }),
    "customers-total": () => db.customer.count({ where: { shopId } }),
    "enquiries-new": () => db.lead.count({ where: { shopId, status: "NEW" } }),
    "stock-low": () => db.product.count({ where: { shopId, active: true, lowStockAt: { gte: db.product.fields.stockQty } } }),
    "orders-open": () => db.purchaseOrder.count({ where: { shopId, status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }),
    "suppliers-total": () => db.vendor.count({ where: { shopId, active: true } }),
    "appointments-today": async () => {
      // "Today" is the shop's own day, in Shop.timezone.
      const [today] = reportDays(nowMs, await loadShopZone(shopId), 1);
      return db.appointment.count({ where: { ...where, startsAt: { gte: new Date(today.from), lt: new Date(today.toExclusive) }, status: { not: "CANCELED" } } });
    },
    "drawers-open": () => db.cashDrawerSession.count({ where: { ...where, closedAt: null } }),
  };

  const values = await Promise.all(keys.map((key) => run[key]().catch(() => null)));
  const out: HubCounts = {};
  keys.forEach((key, index) => {
    const value = values[index];
    if (typeof value === "number") out[key] = value;
  });
  return out;
}

/** The words on a tile for its number: "5 unpaid", "2 ready", "12 open". */
export function hubCountWords(key: HubCountKey, count: number): string {
  switch (key) {
    case "repairs-open": return `${count} open`;
    case "repairs-ready": return `${count} ready`;
    case "repairs-overdue": return `${count} late`;
    case "invoices-unpaid": return `${count} unpaid`;
    case "invoices-partial": return `${count} part-paid`;
    case "recurring-active": return `${count} repeating`;
    case "estimates-open": return `${count} open`;
    case "customers-total": return `${count} ${count === 1 ? "customer" : "customers"}`;
    case "enquiries-new": return `${count} new`;
    case "stock-low": return `${count} low`;
    case "orders-open": return `${count} open`;
    case "suppliers-total": return `${count} ${count === 1 ? "supplier" : "suppliers"}`;
    case "appointments-today": return `${count} today`;
    case "drawers-open": return `${count} open`;
  }
}
