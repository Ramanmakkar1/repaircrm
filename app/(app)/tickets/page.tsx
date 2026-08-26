import Link from "next/link";
import { format } from "date-fns";
import { Plus, Wrench } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, THead, Th, Td } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketRow } from "@/components/tickets/ticket-row";
import { PriorityCell } from "@/components/tickets/priority-badge";
import {
  customerLabel,
  relativeShort,
  RESOLVED_STATUS,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";

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
  const customerId = one(params.customerId, "");
  const page = Math.max(1, Number.parseInt(one(params.page, "1"), 10) || 1);

  // ------------------------------------------------------------- filters ---
  // Every branch narrows an already shop-scoped `where`; shopId is never
  // overridable from the query string.
  const where: Prisma.TicketWhereInput = { shopId };

  if (status === "open") {
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
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  // Single request-time clock, so every row in this render is measured against
  // the same instant. eslint-disable: react-hooks/purity targets Client
  // Components; this is a Server Component that renders once per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered =
    q !== "" ||
    status !== "open" ||
    tech !== "all" ||
    problemType !== "all" ||
    customerId !== "";

  // Preserve the active filters when paging.
  const pageHref = (target: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status !== "open") sp.set("status", status);
    if (tech !== "all") sp.set("tech", tech);
    if (problemType !== "all") sp.set("problemType", problemType);
    if (sort !== "created") sp.set("sort", sort);
    if (customerId) sp.set("customerId", customerId);
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tickets"
        description="Track repair jobs from intake to pickup."
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/new">
              <Plus className="size-3.5" />
              New Ticket
            </Link>
          </Button>
        }
      />

      <TicketFilters
        values={{ q, status, tech, problemType, sort }}
        statuses={ticketStatuses(shop?.settings)}
        problemTypes={problems.map((p) => p.problemType)}
        techs={techs}
      />

      <Card>
        <CardContent className="px-0 py-0">
          {tickets.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title={isFiltered ? "No tickets match those filters" : "No tickets yet"}
              hint={
                isFiltered
                  ? "Try widening the status or tech filter."
                  : "Create the first ticket to start tracking a repair."
              }
              action={
                isFiltered ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/tickets">Clear filters</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href="/tickets/new">
                      <Plus className="size-3.5" />
                      New Ticket
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th className="w-16">#</Th>
                  <Th>Customer</Th>
                  <Th className="min-w-[16rem]">Subject</Th>
                  <Th>Created</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Tech</Th>
                  <Th className="text-right">Last Updated</Th>
                </tr>
              </THead>
              <TBody>
                {tickets.map((ticket) => {
                  const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
                  const overdue =
                    ticket.dueDate !== null &&
                    ticket.dueDate.getTime() < now &&
                    ticket.status !== RESOLVED_STATUS;

                  return (
                    <TicketRow key={ticket.id} href={`/tickets/${ticket.id}`}>
                      <Td className="font-medium tabular-nums">
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="text-accent hover:underline"
                        >
                          {ticket.number}
                        </Link>
                      </Td>
                      <Td className="max-w-[12rem] truncate">
                        {customerLabel(ticket.customer)}
                      </Td>
                      <Td className="max-w-[22rem] truncate text-foreground">
                        {ticket.subject}
                      </Td>
                      <Td
                        className="text-muted-foreground"
                        title={ticket.createdAt.toLocaleString()}
                      >
                        {format(ticket.createdAt, "MMM d")}
                      </Td>
                      <Td
                        className={cn(
                          overdue
                            ? "font-medium text-status-overdue"
                            : "text-muted-foreground",
                        )}
                        title={ticket.dueDate?.toLocaleString()}
                      >
                        {ticket.dueDate ? format(ticket.dueDate, "MMM d") : "—"}
                      </Td>
                      <Td>
                        <StatusBadge status={ticket.status} />
                      </Td>
                      <Td>
                        <PriorityCell priority={ticket.priority} />
                      </Td>
                      <Td className="max-w-[9rem] truncate text-muted-foreground">
                        {ticket.assignedTo?.name ?? (
                          <span className="text-faint-foreground">Unassigned</span>
                        )}
                      </Td>
                      {/*
                        The staleness heat: how long this ticket has sat
                        untouched. Resolved tickets are exempt, so colour on this
                        column always means "someone needs to do something".
                      */}
                      <Td className="text-right">
                        <span
                          title={STALENESS_LABEL[level]}
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
                            STALENESS_CLASS[level],
                          )}
                        >
                          {relativeShort(ticket.updatedAt, now)}
                        </span>
                      </Td>
                    </TicketRow>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>

        {total > 0 ? (
          <CardFooter className="justify-between">
            <p className="text-xs text-muted-foreground tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                asChild={page > 1}
                variant="outline"
                size="sm"
                disabled={page <= 1}
              >
                {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                asChild={page < pageCount}
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
              >
                {page < pageCount ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
