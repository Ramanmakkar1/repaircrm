import Link from "next/link";
import { endOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Wrench } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checklistProgress, parseChecklist } from "@/lib/checklist";
import { locationWhere } from "@/lib/location";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  NEEDS_REPLY_FILTER,
  TicketFilters,
} from "@/components/tickets/ticket-filters";
import { TicketCard } from "@/components/tickets/ticket-card";
import {
  RESOLVED_STATUS,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";
import { OPEN_PART_STATUSES } from "@/components/tickets/part-meta";
import { needsReplyTicketIds } from "@/lib/needs-reply";

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function one(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const q = one(params.q, "").trim();
  const status = one(params.status, "open");
  const tech = one(params.tech, "all");
  const problemType = one(params.problemType, "all");
  const sort = one(params.sort, "created");
  const due = one(params.due, "all");
  const customerId = one(params.customerId, "");
  const page = Math.max(1, Number.parseInt(one(params.page, "1"), 10) || 1);

  // ------------------------------------------------------------- filters ---
  // Every branch narrows an already shop-scoped `where`; shopId is never
  // overridable from the query string.
  // The branch on screen, when one is selected. `locationWhere()` re-validates
  // the cookie against this shop, so it can only ever narrow to our own rows.
  const where: Prisma.TicketWhereInput = { shopId, ...(await locationWhere()) };

  // One request-time clock: the due filters below and every card in the render
  // must agree on where "now" is.
  const requestNow = new Date();

  // Computed for every render, not just the filtered one: the same set draws
  // the blue dot on each card, so one query serves both.
  const needsReply = new Set(await needsReplyTicketIds(shopId));

  if (status === NEEDS_REPLY_FILTER) {
    // An empty `in` is a legitimate "nothing matches" rather than a no-op, so
    // the empty state is honest when the inbox is clear.
    where.id = { in: [...needsReply] };
  } else if (status === "open") {
    where.status = { not: RESOLVED_STATUS };
  } else if (status !== "all") {
    where.status = status;
  }

  if (tech === "unassigned") {
    where.assignedToId = null;
  } else if (tech !== "all") {
    where.assignedToId = tech;
  }

  if (problemType !== "all") {
    where.problemType = problemType;
  }

  if (customerId) {
    where.customerId = customerId;
  }

  // Due filters only ever mean anything for work that is still open, so they
  // exclude resolved tickets regardless of which status pill is lit.
  if (due === "overdue") {
    where.dueDate = { lt: requestNow };
    where.status = { not: RESOLVED_STATUS };
  } else if (due === "today") {
    where.dueDate = { gte: requestNow, lte: endOfDay(requestNow) };
    where.status = { not: RESOLVED_STATUS };
  }

  if (q) {
    const asNumber = Number.parseInt(q.replace(/^#/, ""), 10);
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { customer: { firstName: { contains: q, mode: "insensitive" } } },
      { customer: { lastName: { contains: q, mode: "insensitive" } } },
      { customer: { businessName: { contains: q, mode: "insensitive" } } },
      ...(Number.isFinite(asNumber) ? [{ number: asNumber }] : []),
    ];
  }

  // "Due soonest" puts undated tickets last — otherwise a null dueDate would
  // sort to the top and bury the work that actually has a deadline.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    sort === "due"
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
      : [{ createdAt: "desc" }];

  const [shop, techs, problems, total, tickets] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { settings: true } }),
    db.user.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.ticket.findMany({
      where: { shopId },
      distinct: ["problemType"],
      orderBy: { problemType: "asc" },
      select: { problemType: true },
    }),
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        problemType: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        checklist: true,
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        assignedTo: { select: { name: true } },
        asset: { select: { type: true, make: true, model: true } },
        depositCents: true,
        // Only the OUTSTANDING part orders — a received or canceled one is not
        // something the card should still be shouting about. Filtered here
        // rather than in the component so the page never ships rows it will
        // throw away.
        partOrders: {
          where: { status: { in: [...OPEN_PART_STATUSES] } },
          select: { status: true },
        },
      },
    }),
  ]);

  // Single request-time clock, so every row in this render is measured against
  // the same instant. eslint-disable: react-hooks/purity targets Client
  // Components; this is a Server Component that renders once per request.
  const now = requestNow.getTime();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered =
    q !== "" ||
    status !== "open" ||
    tech !== "all" ||
    problemType !== "all" ||
    due !== "all" ||
    customerId !== "";

  // Preserve the active filters when paging.
  const pageHref = (target: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status !== "open") sp.set("status", status);
    if (tech !== "all") sp.set("tech", tech);
    if (problemType !== "all") sp.set("problemType", problemType);
    if (sort !== "created") sp.set("sort", sort);
    if (due !== "all") sp.set("due", due);
    if (customerId) sp.set("customerId", customerId);
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        description="Track repair jobs from intake to pickup."
        actions={
          <Button asChild>
            <Link href="/tickets/new">
              <Plus />
              New Ticket
            </Link>
          </Button>
        }
      />

      <TicketFilters
        values={{ q, status, tech, problemType, sort, due }}
        statuses={ticketStatuses(shop?.settings)}
        problemTypes={problems.map((p) => p.problemType)}
        techs={techs}
      />

      {tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title={
              status === NEEDS_REPLY_FILTER
                ? "Nobody is waiting on you"
                : isFiltered
                  ? "No tickets match those filters"
                  : "No tickets yet"
            }
            hint={
              status === NEEDS_REPLY_FILTER
                ? "Every customer email and text has been answered."
                : isFiltered
                  ? "Try another status pill, or clear the filters to see everything."
                  : "Create the first ticket to start tracking a repair."
            }
            action={
              isFiltered ? (
                <Button asChild variant="outline">
                  <Link href="/tickets">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/tickets/new">
                    <Plus />
                    New Ticket
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={{
                  ...ticket,
                  checklist: checklistProgress(parseChecklist(ticket.checklist)),
                  needsReply: needsReply.has(ticket.id),
                }}
                now={now}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[13.5px] font-medium text-muted-foreground tabular-nums">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button asChild={page > 1} variant="outline" disabled={page <= 1}>
                {page > 1 ? (
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeft />
                    Previous
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft />
                    Previous
                  </span>
                )}
              </Button>
              <span className="px-1 text-[13.5px] font-semibold text-muted-foreground tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                asChild={page < pageCount}
                variant="outline"
                disabled={page >= pageCount}
              >
                {page < pageCount ? (
                  <Link href={pageHref(page + 1)}>
                    Next
                    <ChevronRight />
                  </Link>
                ) : (
                  <span>
                    Next
                    <ChevronRight />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
