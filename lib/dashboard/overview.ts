/**
 * The loader behind /dashboard ("Shop overview").
 *
 * Server-only. ONE batched set of queries (two waves: the second only needs
 * ids the first returned), every one filtered by the session's `shopId` and the
 * branch on screen (`locationWhere()`), every one bounded by a `take` or a date
 * range and reading `select`ed columns only, so the cost is a fixed number of
 * round trips however many repairs the shop has.
 *
 * It returns a plain, serialisable object (numbers, strings, arrays: dates are
 * epoch milliseconds). Everything computable lives in ./logic as pure functions;
 * this file fetches rows and hands them over.
 *
 * ROLE RULE: a technician's overview never runs a money query (no payments,
 * refunds, invoices or product sales), so there is nothing to hide in the
 * markup. See components/reports/query.ts for the same rule.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { checklistProgress, parseChecklist, type ChecklistProgress } from "@/lib/checklist";
import { requestNow } from "@/lib/now";
import { needsReplyTicketIds } from "@/lib/needs-reply";
import { PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { customerLabel } from "@/components/customers/format";
import { primaryPhone, telHref } from "@/components/customers/customer-facts";
import { deviceName } from "@/components/tickets/repair-card-facts";
import { OPEN_PART_STATUSES } from "@/components/tickets/part-meta";
import { pickupMoney } from "@/components/tickets/pickup-card-facts";
import { READY_FOR_PICKUP_STATUS, RESOLVED_STATUS, ticketStatuses } from "@/components/tickets/ticket-meta";
import {
  averageFinish,
  benchSentence,
  buildNeedsYou,
  buildPipeline,
  buildWorkload,
  compareTakings,
  countNeedsYou,
  dailyTakings,
  dayKeyIn,
  dayWords,
  finishWords,
  firstNameOf,
  greetingFor,
  hourIn,
  longDateIn,
  pipelineStatuses,
  popularProblems,
  reportDays,
  reportsDayHref,
  reportsRangeHref,
  safeTimeZone,
  summariseOwed,
  timeIn,
  topProducts,
  UNASSIGNED_KEY,
  type DayTakings,
  type DeviceRef,
  type LowStockItem,
  type NeedsYouRow,
  type OverdueRepair,
  type OwedSummary,
  type PipelineTile,
  type PopularRow,
  type ReadyRepair,
  type ReplyWaiting,
  type TakingsComparison,
  type WorkloadRow,
} from "./logic";
import { canSeeMoney, loadOwedInvoices, loadProductLines, loadTakingsRows, todayWindow } from "./money";

export type DashboardUser = { shopId: string; userId: string; role: string; name: string };
/** `locationWhere()`'s shape: one branch, or nothing for the whole shop. */
export type BranchScope = { locationId?: string };

export type TodaySection = {
  /** Net of refunds: the same figure as "Net revenue" on Reports for today. */
  netCents: number;
  grossCents: number;
  refundCents: number;
  cashCents: number;
  cardCents: number;
  otherCents: number;
  comparison: TakingsComparison;
  /** The last seven days, today last. */
  days: { key: string; initial: string; dayOfMonth: number; label: string; netCents: number; isToday: boolean; href: string }[];
  weekNetCents: number;
  todayHref: string;
  /** Reports for the seven days the bars show. */
  weekHref: string;
};

export type OwedSection = OwedSummary & { /** More unpaid invoices exist than were read. */ truncated: boolean };

export type SellingRow = {
  productId: string | null;
  name: string;
  units: number;
  cents: number;
  category: string | null;
  catalogImage: string | null;
  imageUrl: string | null;
};

export type AppointmentRow = { id: string; title: string; customerName: string | null; startsAt: number; day: string; time: string; href: string };

export type MyQueueRepair = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  dueAt: number | null;
  customer: { firstName: string; lastName: string; businessName: string | null };
  assignedToName: string | null;
  asset: { type: string; make: string | null; model: string | null } | null;
  attachments: { id: string; fileName: string }[];
  partOrders: { status: string }[];
  checklist: ChecklistProgress | null;
  depositCents: number;
  needsReply: boolean;
};

export type MyQueue = { open: number; late: number; repairs: MyQueueRepair[]; href: string };

export type ShopOverview = {
  generatedAt: number;
  showMoney: boolean;
  canOrder: boolean;
  isTech: boolean;
  shopName: string;
  branchName: string | null;
  greeting: string;
  firstName: string;
  dateLabel: string;
  timezone: string;
  /** null for a technician. */
  today: TodaySection | null;
  owed: OwedSection | null;
  bench: {
    tiles: PipelineTile[];
    open: number;
    late: number;
    dueToday: number;
    /** Customers who wrote in and have not been answered: the Repairs list's "Needs reply" count. */
    needsReply: number;
    sentence: string;
    /** null when nothing was finished in the last 30 days. */
    finish: { words: string; count: number } | null;
  };
  needsYou: { rows: NeedsYouRow[]; candidates: number };
  workload: { rows: WorkloadRow[]; hidden: number };
  /** null for a technician. */
  selling: { rows: SellingRow[]; href: string } | null;
  popular: PopularRow[];
  appointments: AppointmentRow[];
  stockWatch: { total: number; items: LowStockItem[] };
  /** Only for a technician: their own queue stands in for the Today section. */
  myQueue: MyQueue | null;
};

const TAKE_OVERDUE = 6;
const TAKE_READY = 30;
const TAKE_FINISHED = 2000;
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** `{ status: count }` from a groupBy on status. */
const byStatus = (rows: readonly { status: string; _count: { _all: number } }[]): Record<string, number> =>
  Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

/** `{ userId: count }` from a groupBy on the assignee; repairs nobody has sit under UNASSIGNED_KEY. */
const byAssignee = (rows: readonly { assignedToId: string | null; _count: { _all: number } }[]): Record<string, number> =>
  Object.fromEntries(rows.map((row) => [row.assignedToId ?? UNASSIGNED_KEY, row._count._all]));

const deviceRef = (asset: { type: string; make: string | null; model: string | null } | null): DeviceRef | null =>
  asset ? { type: asset.type, make: asset.make, model: asset.model } : null;

export async function loadShopOverview(user: DashboardUser, branch: BranchScope, nowMs: number = requestNow()): Promise<ShopOverview> {
  const { shopId, userId, role } = user;
  const showMoney = canSeeMoney(role);
  const isTech = role === "TECH";
  const canOrder = role === "OWNER";
  const locationId = branch.locationId;
  const now = new Date(nowMs);

  // "Today" is the shop's own day, so the shop's time zone is read before any window is cut. One row by primary key.
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { name: true, timezone: true, settings: true } });
  const zone = safeTimeZone(shop?.timezone);
  const month = reportDays(nowMs, zone, 30);
  const days = month.slice(-8);
  const today = todayWindow(nowMs, zone);
  const weekFrom = days[1].from;
  const monthFrom = month[0].from;

  // Open work is "not resolved", exactly as the Repairs list reads it.
  const open = { shopId, ...branch, status: { not: RESOLVED_STATUS } } satisfies Prisma.TicketWhereInput;
  const late = { ...open, dueDate: { lt: now } } satisfies Prisma.TicketWhereInput;
  const cardCustomer = { select: { firstName: true, lastName: true, businessName: true, phone: true, mobile: true } } as const;
  const cardAsset = { select: { type: true, make: true, model: true } } as const;

  // ------------------------------------------------------------------ wave 1
  const [
    location,
    statusGroups,
    lateGroups,
    dueToday,
    openByAssignee,
    lateByAssignee,
    users,
    problemGroups,
    finished,
    replyIds,
    readyTickets,
    readyInvoices,
    overdueTickets,
    lowRows,
    lowTotal,
    appointments,
    takings,
    owedLoad,
    productLines,
    myRepairs,
  ] = await Promise.all([
    locationId ? db.location.findFirst({ where: { id: locationId, shopId }, select: { name: true } }) : Promise.resolve(null),
    db.ticket.groupBy({ by: ["status"], where: { shopId, ...branch }, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["status"], where: late, _count: { _all: true } }),
    // Due later today on the shop's own calendar, not the server's.
    db.ticket.count({ where: { ...open, dueDate: { gte: now, lt: new Date(today.toExclusive) } } }),
    db.ticket.groupBy({ by: ["assignedToId"], where: open, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["assignedToId"], where: late, _count: { _all: true } }),
    db.user.findMany({ where: { shopId }, select: { id: true, name: true, role: true, active: true } }),
    db.ticket.groupBy({
      by: ["problemType"],
      where: { shopId, ...branch, createdAt: { gte: new Date(monthFrom), lt: new Date(today.toExclusive) } },
      _count: { _all: true },
    }),
    db.ticket.findMany({
      where: { shopId, ...branch, resolvedAt: { gte: new Date(monthFrom), lt: new Date(today.toExclusive) } },
      take: TAKE_FINISHED,
      select: { createdAt: true, resolvedAt: true },
    }),
    needsReplyTicketIds(shopId, locationId),
    db.ticket.findMany({
      where: { shopId, ...branch, status: READY_FOR_PICKUP_STATUS },
      orderBy: { updatedAt: "asc" },
      take: TAKE_READY,
      select: {
        id: true,
        number: true,
        updatedAt: true,
        dueDate: true,
        customer: cardCustomer,
        asset: cardAsset,
        // The newest "moved to Ready for pickup" entry on the timeline, as the pickup counter reads it.
        comments: { where: { shopId, updateType: READY_FOR_PICKUP_STATUS }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    showMoney ? loadReadyInvoices(shopId, branch) : Promise.resolve([] as ReadyInvoice[]),
    db.ticket.findMany({
      where: late,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: TAKE_OVERDUE,
      select: { id: true, number: true, dueDate: true, priority: true, customer: cardCustomer, asset: cardAsset },
    }),
    db.product.findMany({
      where: lowStockWhere(shopId),
      orderBy: [{ stockQty: "asc" }, { name: "asc" }],
      take: 6,
      select: {
        id: true,
        name: true,
        category: true,
        catalogImage: true,
        stockQty: true,
        lowStockAt: true,
        vendorId: true,
        attachments: PRODUCT_IMAGE_SELECT,
      },
    }),
    db.product.count({ where: lowStockWhere(shopId) }),
    db.appointment.findMany({
      where: { shopId, ...branch, status: "SCHEDULED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: { id: true, title: true, startsAt: true, customer: { select: { firstName: true, lastName: true, businessName: true } } },
    }),
    showMoney ? loadTakingsRows(shopId, locationId, days[0].from, today.toExclusive) : Promise.resolve(null),
    showMoney ? loadOwedInvoices(shopId, locationId) : Promise.resolve(null),
    showMoney ? loadProductLines(shopId, locationId, weekFrom, today.toExclusive) : Promise.resolve([]),
    isTech ? loadMyQueue(shopId, userId, branch) : Promise.resolve([] as MyQueueRow[]),
  ]);

  // ------------------------------------------------------------------ wave 2
  const counts = byStatus(statusGroups);
  const lateCounts = byStatus(lateGroups);
  const statuses = pipelineStatuses(ticketStatuses(shop?.settings), statusGroups.map((group) => group.status));
  const populated = statuses.filter((status) => (counts[status] ?? 0) > 0);
  const topLines = showMoney ? topProducts(productLines, 5) : [];
  const topIds = topLines.flatMap((line) => (line.productId ? [line.productId] : []));

  const [deviceLists, replyTickets, lateReplies, productRows] = await Promise.all([
    // The oldest repairs with a device on each status that has any: one query per status of the pipeline, never per repair.
    Promise.all(
      populated.map((status) =>
        db.ticket.findMany({
          where: { shopId, ...branch, status, assetId: { not: null } },
          orderBy: { createdAt: "asc" },
          take: 3,
          select: { asset: cardAsset },
        }),
      ),
    ),
    replyIds.length
      ? db.ticket.findMany({
          where: { shopId, ...branch, id: { in: replyIds.slice(0, 500) } },
          orderBy: { lastInboundAt: "desc" },
          take: 3,
          select: { id: true, number: true, lastInboundAt: true, customer: cardCustomer, asset: cardAsset },
        })
      : Promise.resolve([]),
    // How many of the waiting replies are also late: one repair is one thing to do, not two.
    replyIds.length ? db.ticket.count({ where: { ...late, id: { in: replyIds.slice(0, 500) } } }) : Promise.resolve(0),
    topIds.length
      ? db.product.findMany({
          where: { shopId, id: { in: topIds } },
          take: topIds.length,
          select: { id: true, category: true, catalogImage: true, attachments: PRODUCT_IMAGE_SELECT },
        })
      : Promise.resolve([]),
  ]);

  // ---------------------------------------------------------------- the bench
  const devices: Record<string, DeviceRef[]> = {};
  populated.forEach((status, index) => {
    devices[status] = deviceLists[index].flatMap((row) => (row.asset ? [{ type: row.asset.type, make: row.asset.make, model: row.asset.model }] : []));
  });
  const tiles = buildPipeline({ statuses, counts, overdue: lateCounts, devices });
  const openTotal = tiles.reduce((sum, tile) => sum + tile.count, 0);
  const lateTotal = tiles.reduce((sum, tile) => sum + tile.overdue, 0);
  const finish = averageFinish(finished.flatMap((row) => (row.resolvedAt ? [{ createdAt: row.createdAt.getTime(), resolvedAt: row.resolvedAt.getTime() }] : [])));

  // ------------------------------------------------------------------- money
  let todaySection: TodaySection | null = null;
  let owedSection: OwedSection | null = null;
  if (takings) {
    const rows: DayTakings[] = dailyTakings(days, takings.payments, takings.refunds);
    const lastWeek = rows[0];
    const yesterday = rows[6];
    const current = rows[7];
    const earlier = rows.slice(0, 7).reduce((sum, row) => sum + row.netCents, 0);
    const chartDays = days.slice(1).map((day, index) => ({
      key: day.key,
      initial: day.initial,
      dayOfMonth: day.dayOfMonth,
      label: day.label,
      netCents: rows[index + 1].netCents,
      isToday: day.isToday,
      href: reportsDayHref(day.key),
    }));
    todaySection = {
      netCents: current.netCents,
      grossCents: current.grossCents,
      refundCents: current.refundCents,
      cashCents: current.cashCents,
      cardCents: current.cardCents,
      otherCents: current.otherCents,
      comparison: compareTakings({
        todayNetCents: current.netCents,
        todayGrossCents: current.grossCents,
        yesterdayNetCents: yesterday.netCents,
        lastWeekNetCents: lastWeek.netCents,
        earlierNetCents: earlier,
        weekday: days[7].weekday,
      }),
      days: chartDays,
      weekNetCents: chartDays.reduce((sum, day) => sum + day.netCents, 0),
      todayHref: reportsDayHref(days[7].key),
      weekHref: reportsRangeHref(days[1].key, days[7].key),
    };
  }
  if (owedLoad) owedSection = { ...summariseOwed(owedLoad.invoices, nowMs, { zone }), truncated: owedLoad.truncated };

  const selling: ShopOverview["selling"] = showMoney
    ? {
        href: reportsRangeHref(days[1].key, days[7].key),
        rows: topLines.map((line) => {
          const product = productRows.find((row) => row.id === line.productId);
          return {
            productId: line.productId,
            name: line.name,
            units: line.units,
            cents: line.cents,
            category: product?.category ?? null,
            catalogImage: product?.catalogImage ?? null,
            imageUrl: product?.attachments[0] ? `/files/${product.attachments[0].id}` : null,
          };
        }),
      }
    : null;

  // ------------------------------------------------------------ needs you now
  const readyMoneyByTicket = new Map<string, ReadyInvoice[]>();
  for (const invoice of readyInvoices) {
    readyMoneyByTicket.set(invoice.ticketId, [...(readyMoneyByTicket.get(invoice.ticketId) ?? []), invoice]);
  }
  const readyRepairs: ReadyRepair[] = readyTickets.map((ticket) => {
    const money = showMoney ? pickupMoney(readyMoneyByTicket.get(ticket.id) ?? []) : null;
    const phone = primaryPhone(ticket.customer).value;
    return {
      id: ticket.id,
      number: ticket.number,
      customer: customerLabel(ticket.customer),
      device: deviceRef(ticket.asset),
      deviceLabel: deviceName(ticket.asset),
      readySince: (ticket.comments[0]?.createdAt ?? ticket.updatedAt).getTime(),
      callHref: phone ? telHref(phone) : null,
      dueCents: money ? (money.kind === "due" ? money.dueCents : 0) : null,
      invoiceId: money?.invoiceId ?? null,
      dueAt: ticket.dueDate ? ticket.dueDate.getTime() : null,
    };
  });
  const overdueRepairs: OverdueRepair[] = overdueTickets.flatMap((ticket) =>
    ticket.dueDate
      ? [{ id: ticket.id, number: ticket.number, customer: customerLabel(ticket.customer), device: deviceRef(ticket.asset), deviceLabel: deviceName(ticket.asset), dueAt: ticket.dueDate.getTime(), priority: ticket.priority }]
      : [],
  );
  const replies: ReplyWaiting[] = replyTickets.flatMap((ticket) =>
    ticket.lastInboundAt
      ? [{ id: ticket.id, number: ticket.number, customer: customerLabel(ticket.customer), device: deviceRef(ticket.asset), deviceLabel: deviceName(ticket.asset), since: ticket.lastInboundAt.getTime() }]
      : [],
  );
  const lowStock: LowStockItem[] = lowRows.map((row) => ({
    id: row.id,
    name: row.name,
    stockQty: row.stockQty,
    lowStockAt: row.lowStockAt,
    vendorId: row.vendorId,
    category: row.category,
    catalogImage: row.catalogImage,
    imageUrl: row.attachments[0] ? `/files/${row.attachments[0].id}` : null,
  }));

  const built = buildNeedsYou({
    now: nowMs,
    showMoney,
    canOrder,
    overdueRepairs,
    readyRepairs,
    lateInvoices: owedSection?.lateInvoices ?? [],
    replies,
    lowStock,
  });
  // "N more can wait" counts everything that needs you, not only the rows fetched to rank: the lists above are cut to a few.
  const needsYou = {
    rows: built.rows,
    candidates: Math.max(
      built.candidates,
      countNeedsYou({
        now: nowMs,
        showMoney,
        lateRepairs: lateTotal,
        replyIds,
        lateReplies,
        readyRepairs,
        lateInvoices: owedSection?.overdueCount ?? 0,
        lowStock: lowTotal,
      }),
    ),
  };

  // -------------------------------------------------------------- team and demand
  const openByUser = byAssignee(openByAssignee);
  const lateByUser = byAssignee(lateByAssignee);
  const workload = buildWorkload({ users, openByUser, lateByUser });

  const hour = hourIn(nowMs, zone);
  const myOpen = openByUser[userId] ?? 0;
  const myLate = lateByUser[userId] ?? 0;
  const needsReplySet = new Set(replyIds);

  return {
    generatedAt: nowMs,
    showMoney,
    canOrder,
    isTech,
    shopName: shop?.name ?? "Your shop",
    branchName: location?.name ?? null,
    greeting: greetingFor(hour),
    firstName: firstNameOf(user.name),
    dateLabel: longDateIn(nowMs, zone),
    timezone: zone,
    today: todaySection,
    owed: owedSection,
    bench: {
      tiles,
      open: openTotal,
      late: lateTotal,
      dueToday,
      needsReply: replyIds.length,
      sentence: benchSentence(openTotal, lateTotal),
      finish: finish.count > 0 ? { words: finishWords(finish.meanMs), count: finish.count } : null,
    },
    needsYou,
    workload,
    selling,
    popular: popularProblems(problemGroups.map((group) => ({ problemType: group.problemType, count: group._count._all }))),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      customerName: appointment.customer ? customerLabel(appointment.customer) : null,
      startsAt: appointment.startsAt.getTime(),
      day: dayWords(appointment.startsAt.getTime(), nowMs, zone),
      time: timeIn(appointment.startsAt.getTime(), zone),
      // The day the visit is on, as a day: the counter sees that day's visits, not a week to scroll.
      href: `/appointments?view=day&date=${dayKeyIn(appointment.startsAt.getTime(), zone)}`,
    })),
    stockWatch: { total: lowTotal, items: lowStock.slice(0, 4) },
    myQueue: isTech
      ? {
          open: myOpen,
          late: myLate,
          href: `/tickets?tech=${encodeURIComponent(userId)}`,
          repairs: myRepairs.map((repair) => ({
            id: repair.id,
            number: repair.number,
            subject: repair.subject,
            status: repair.status,
            priority: repair.priority,
            dueAt: repair.dueDate ? repair.dueDate.getTime() : null,
            customer: { firstName: repair.customer.firstName, lastName: repair.customer.lastName, businessName: repair.customer.businessName },
            assignedToName: repair.assignedTo?.name ?? null,
            asset: repair.asset,
            attachments: repair.attachments,
            partOrders: repair.partOrders,
            checklist: checklistProgress(parseChecklist(repair.checklist)),
            depositCents: repair.depositCents,
            needsReply: needsReplySet.has(repair.id),
          })),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Small queries, kept out of the big Promise.all so their result types stay named
// ---------------------------------------------------------------------------

/**
 * Active products at or below their reorder point: the Stock list's own rule.
 * `lowStockAt >= stockQty` is a same-row column comparison; a product with no
 * reorder point is NULL there and never matches, which is the "not tracked"
 * behaviour for labour and services.
 */
export function lowStockWhere(shopId: string): Prisma.ProductWhereInput {
  return { shopId, active: true, lowStockAt: { gte: db.product.fields.stockQty } };
}

type ReadyInvoice = {
  id: string;
  number: number;
  status: string;
  ticketId: string;
  taxRateBps: number;
  lines: { quantity: number; unitPriceCents: number; taxable: boolean }[];
  payments: { amountCents: number }[];
  refunds: { amountCents: number; status: string }[];
};

/** The invoices on the repairs that are ready for pickup: what the pickup counter totals per repair. Money viewers only. */
async function loadReadyInvoices(shopId: string, branch: BranchScope): Promise<ReadyInvoice[]> {
  const rows = await db.invoice.findMany({
    where: { shopId, status: { not: "VOID" }, ticket: { is: { shopId, ...branch, status: READY_FOR_PICKUP_STATUS } } },
    take: 200,
    select: {
      id: true,
      number: true,
      status: true,
      ticketId: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      refunds: { select: { amountCents: true, status: true } },
    },
  });
  return rows.flatMap((row) => (row.ticketId ? [{ ...row, ticketId: row.ticketId }] : []));
}

/** A technician's own open repairs, soonest due first: the card data the Repairs list draws. */
async function loadMyQueue(shopId: string, userId: string, branch: BranchScope) {
  return db.ticket.findMany({
    where: { shopId, ...branch, assignedToId: userId, status: { not: RESOLVED_STATUS } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 4,
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      dueDate: true,
      checklist: true,
      depositCents: true,
      customer: { select: { firstName: true, lastName: true, businessName: true } },
      assignedTo: { select: { name: true } },
      asset: { select: { type: true, make: true, model: true } },
      partOrders: { where: { status: { in: [...OPEN_PART_STATUSES] } }, select: { status: true } },
      attachments: { where: { mimeType: { in: IMAGE_MIME } }, orderBy: { createdAt: "asc" }, take: 8, select: { id: true, fileName: true } },
    },
  });
}
type MyQueueRow = Awaited<ReturnType<typeof loadMyQueue>>[number];
