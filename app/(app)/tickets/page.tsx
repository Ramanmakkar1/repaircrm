import type { Metadata } from "next";
import Link from "next/link";
import { endOfDay, format } from "date-fns";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { locationWhere } from "@/lib/location";
import { DUE_TONE_CLASS, dueChip } from "@/lib/sla";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { RowLink } from "@/components/list/row-link";
import { SavedViewsControl } from "@/components/list/saved-views";
import {
  BulkBar,
  SelectAll,
  SelectRow,
  SelectionScope,
} from "@/components/list/selection";
import { TicketBulkActions } from "@/components/tickets/ticket-bulk-actions";
import {
  TicketToolbar,
  type TicketFilterValues,
} from "@/components/tickets/ticket-toolbar";
import {
  asPriority,
  customerLabel,
  NEEDS_REPLY_FILTER,
  PRIORITY_META,
  RESOLVED_STATUS,
  relativeShort,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";
import { OPEN_PART_STATUSES } from "@/components/tickets/part-meta";
import { needsReplyTicketIds } from "@/lib/needs-reply";
import { listSavedViews } from "@/lib/saved-views-query";
import { normalizeViewQuery, savedViewHref } from "@/lib/saved-views";

export const metadata: Metadata = { title: "Tickets · RepairFlow" };

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** The two response-target lenses, as a chip group rather than another row of pills. */
const DUE_VIEWS: { value: string; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
];

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

  const filters: TicketFilterValues = {
    q: one(params.q, "").trim(),
    status: one(params.status, "open"),
    tech: one(params.tech, "all"),
    problemType: one(params.problemType, "all"),
    sort: one(params.sort, "created"),
    due: one(params.due, "all"),
    customerId: one(params.customerId, ""),
  };
  const { q, status, tech, problemType, sort, due, customerId } = filters;
  const page = Math.max(1, Number.parseInt(one(params.page, "1"), 10) || 1);

  // ------------------------------------------------------------- filters ---
  // Every branch narrows an already shop-scoped `where`; shopId is never
  // overridable from the query string.
  // The branch on screen, when one is selected. `locationWhere()` re-validates
  // the cookie against this shop, so it can only ever narrow to our own rows.
  const where: Prisma.TicketWhereInput = { shopId, ...(await locationWhere()) };

  // One request-time clock: the due filters below and every row in the render
  // must agree on where "now" is.
  const requestNow = new Date();

  // Computed for every render, not just the filtered one: the same set draws
  // the blue dot on each row, so one query serves both.
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
  // exclude resolved tickets regardless of which view is selected.
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
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        assignedTo: { select: { name: true } },
        asset: { select: { type: true, make: true, model: true } },
        // Only the OUTSTANDING part orders — a received or canceled one is not
        // something the row should still be shouting about. Filtered here
        // rather than in the render so the page never ships rows it will
        // throw away.
        partOrders: {
          where: { status: { in: [...OPEN_PART_STATUSES] } },
          select: { status: true },
        },
      },
    }),
  ]);

  // Single request-time clock, so every row in this render is measured against
  // the same instant.
  const now = requestNow.getTime();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered =
    q !== "" ||
    status !== "open" ||
    tech !== "all" ||
    problemType !== "all" ||
    due !== "all";

  // ------------------------------------------------------------- linking ---
  /** A filter change always lands on page 1; paging keeps every filter. */
  const filterHref = (patch: Partial<TicketFilterValues>) =>
    ticketsHref({ ...filters, ...patch }, 1);
  const pageHref = (target: number) => ticketsHref(filters, target);

  // The shop's own status list. It feeds both the view tabs and the bulk
  // "Status" menu, so the two can never offer different words.
  const statuses = ticketStatuses(shop?.settings);

  /*
    This user's saved filters for this screen. `currentQuery` is normalised the
    same way a saved one is — sorted, and stripped of paging — so a view
    highlights whether you reached it by clicking its tab or by rebuilding the
    same filter by hand.
  */
  const savedViews = await listSavedViews("/tickets");
  const currentQuery = normalizeViewQuery(
    new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value] as [string, string]] : [],
      ),
    ).toString(),
  );

  const views = [
    { key: "open", label: "Open jobs" },
    { key: "all", label: "All" },
    // Not a status — a state the shop is in. It sits with the statuses because
    // "who is waiting on me" is the same kind of question as "what is on the
    // bench", and a front desk asks it just as often.
    { key: NEEDS_REPLY_FILTER, label: "Needs reply" },
    ...statuses.map((s) => ({ key: s, label: s })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tickets"
        description="Track repair jobs from intake to pickup."
        actions={
          <Button asChild>
            <Link href="/tickets/new">
              <ACTIONS.add />
              New Ticket
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        {/*
          The built-in views, then this user's saved ones, in one strip. A
          saved view IS a view — rendering it as a different kind of control
          would say it was a different kind of thing.
        */}
        <FilterTabs
          aria-label="Ticket views"
          tabs={[
            ...views.map((view) => ({
              label: view.label,
              href: filterHref({ status: view.key }),
              active: status === view.key,
            })),
            ...savedViews.map((view) => ({
              label: view.name,
              href: savedViewHref("/tickets", view.query),
              active: view.query === currentQuery,
            })),
          ]}
          trailing={
            <SavedViewsControl
              path="/tickets"
              views={savedViews}
              builtIn={views.map((view) => ({
                label: view.label,
                query: normalizeViewQuery(
                  new URLSearchParams(
                    view.key ? { status: view.key } : {},
                  ).toString(),
                ),
              }))}
            />
          }
        />

        <TicketToolbar values={filters} problemTypes={problems.map((p) => p.problemType)} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChips
            label="Due"
            options={DUE_VIEWS.map((view) => ({
              label: view.label,
              href: filterHref({ due: view.value }),
              active: due === view.value,
            }))}
          />
          {techs.length > 0 ? (
            <FilterChips
              label="Tech"
              options={[
                { label: "All", href: filterHref({ tech: "all" }), active: tech === "all" },
                {
                  label: "Unassigned",
                  href: filterHref({ tech: "unassigned" }),
                  active: tech === "unassigned",
                },
                ...techs.map((t) => ({
                  label: t.name,
                  href: filterHref({ tech: t.id }),
                  active: tech === t.id,
                })),
              ]}
            />
          ) : null}
        </div>
      </div>

      {/*
        The selection covers the table and the bar together. Ids are the rows
        as rendered, in render order — the primitive prunes anything that
        leaves the list and reads shift-click ranges out of this array.
      */}
      <SelectionScope ids={tickets.map((ticket) => ticket.id)}>
        <Card className="overflow-hidden">
          <CardContent className="px-0 py-0">
            {tickets.length === 0 ? (
              <EmptyState
                icon={ICONS.ticket}
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
                      ? "Try another view, or clear the filters to see everything."
                      : "Create the first ticket to start tracking a repair."
                }
                action={
                  isFiltered ? (
                    <Button asChild variant="outline">
                      <Link href={filterHref({ q: "", status: "open", tech: "all", problemType: "all", due: "all" })}>
                        Clear filters
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href="/tickets/new">
                        <ACTIONS.add />
                        New Ticket
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <Tr>
                      <SelectAll />
                      <Th>Ticket</Th>
                      <Th>Customer</Th>
                      <Th>Subject</Th>
                      <Th>Status</Th>
                      <Th>Assigned</Th>
                      <Th>Due</Th>
                      <Th className="text-right">Updated</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {tickets.map((ticket) => {
                      const priority = asPriority(ticket.priority);
                      const loud = priority === "HIGH" || priority === "URGENT";
                      const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
                      // Quiet until the job is actually rotting: a green "touched
                      // today" chip on nine rows out of ten is decoration, not a
                      // signal.
                      const heat = level === "stale" || level === "critical";
                      const chip = dueChip(
                        ticket.dueDate,
                        ticket.status === RESOLVED_STATUS,
                        now,
                      );
                      const device =
                        ticket.asset && (ticket.asset.make || ticket.asset.model)
                          ? [ticket.asset.make, ticket.asset.model]
                              .filter(Boolean)
                              .join(" ")
                          : (ticket.asset?.type ?? null);
                      const openParts = ticket.partOrders.length;

                      return (
                        <RowLink key={ticket.id} href={`/tickets/${ticket.id}`}>
                          <SelectRow
                            id={ticket.id}
                            label={`ticket #${ticket.number}`}
                          />
                          <Td>
                            <span className="flex items-center gap-1.5">
                              <Link
                                href={`/tickets/${ticket.id}`}
                                className="rf-id font-semibold text-accent-soft-foreground hover:underline"
                              >
                                #{ticket.number}
                              </Link>
                              {/* One small blue dot: a customer message is
                                  waiting. It has to survive being scanned in half
                                  a second, so it rides on the id rather than
                                  becoming another pill further down the row. */}
                              {needsReply.has(ticket.id) ? (
                                <span
                                  title="Customer replied — no answer yet"
                                  className="size-[7px] shrink-0 rounded-full bg-accent"
                                >
                                  <span className="sr-only">Needs reply</span>
                                </span>
                              ) : null}
                            </span>
                          </Td>

                          <Td className="font-medium text-foreground">
                            <span className="block max-w-[180px] truncate">
                              {customerLabel(ticket.customer)}
                            </span>
                          </Td>

                          {/*
                            Subject and device shared a row and half a screen
                            between them, which pushed "Updated" off the right
                            edge at 1440px — the table scrolled sideways to show
                            a column that was mostly restating the subject
                            ("ThinkPad T14 — pop-ups" next to "Lenovo ThinkPad
                            T14"). The device is structured data and the subject
                            is typed by hand, so neither can be dropped; stacking
                            them costs one column and no information.
                          */}
                          <Td className="whitespace-normal">
                            <span className="flex items-center gap-2">
                              <span
                                className="block max-w-[320px] truncate"
                                title={ticket.subject}
                              >
                                {ticket.subject}
                              </span>
                              {loud ? (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-sm px-1.5 py-0.5 text-[11.5px] font-semibold leading-none",
                                    PRIORITY_META[priority].chip,
                                  )}
                                >
                                  {PRIORITY_META[priority].label}
                                </span>
                              ) : null}
                              {openParts > 0 ? (
                                <span
                                  title="Part orders still outstanding"
                                  className="shrink-0 rounded-sm bg-status-waiting-bg px-1.5 py-0.5 text-[11.5px] font-semibold leading-none text-status-waiting-fg"
                                >
                                  {openParts} part{openParts === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block max-w-[320px] truncate text-[12.5px] text-muted-foreground">
                              {device ?? ticket.problemType ?? "—"}
                            </span>
                          </Td>

                          <Td>
                            <StatusBadge status={ticket.status} />
                          </Td>

                          <Td
                            className={cn(
                              ticket.assignedTo
                                ? "text-muted-foreground"
                                : "text-faint-foreground",
                            )}
                          >
                            <span className="block max-w-[130px] truncate">
                              {ticket.assignedTo?.name ?? "Unassigned"}
                            </span>
                          </Td>

                          <Td>
                            {!ticket.dueDate ? (
                              <span className="text-faint-foreground">—</span>
                            ) : chip && chip.tone !== "later" ? (
                              <span
                                className={cn(
                                  "inline-block rounded-sm px-1.5 py-0.5 text-[11.5px] leading-none",
                                  DUE_TONE_CLASS[chip.tone],
                                )}
                              >
                                {chip.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {format(ticket.dueDate, "MMM d")}
                              </span>
                            )}
                          </Td>

                          <Td className="text-right">
                            <span
                              title={STALENESS_LABEL[level]}
                              className={cn(
                                "rf-num text-[12.5px]",
                                heat
                                  ? cn(
                                      "inline-block rounded-sm px-1.5 py-0.5 font-semibold",
                                      STALENESS_CLASS[level],
                                    )
                                  : "text-muted-foreground",
                              )}
                            >
                              {relativeShort(ticket.updatedAt, now)}
                            </span>
                          </Td>
                        </RowLink>
                      );
                    })}
                  </TBody>
                </Table>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                  <p className="rf-num text-[12.5px] font-medium text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
                    {total}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button asChild={page > 1} size="sm" variant="outline" disabled={page <= 1}>
                      {page > 1 ? (
                        <Link href={pageHref(page - 1)}>
                          <ACTIONS.back />
                          Previous
                        </Link>
                      ) : (
                        <span>
                          <ACTIONS.back />
                          Previous
                        </span>
                      )}
                    </Button>
                    <span className="rf-num px-1 text-[12.5px] font-medium text-muted-foreground">
                      {page} / {pageCount}
                    </span>
                    <Button
                      asChild={page < pageCount}
                      size="sm"
                      variant="outline"
                      disabled={page >= pageCount}
                    >
                      {page < pageCount ? (
                        <Link href={pageHref(page + 1)}>
                          Next
                          <ACTIONS.next />
                        </Link>
                      ) : (
                        <span>
                          Next
                          <ACTIONS.next />
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <BulkBar noun="ticket">
          <TicketBulkActions techs={techs} statuses={statuses} />
        </BulkBar>
      </SelectionScope>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The one place a /tickets URL is spelled. Defaults are stripped so the
 * everyday views stay on clean, shareable links; `customerId` survives every
 * filter change because it scopes the list rather than filtering it.
 *
 * `components/tickets/ticket-toolbar.tsx` carries a copy for the controls that
 * genuinely need a client — a helper exported from a `"use client"` module
 * cannot be called during a server render.
 */
function ticketsHref(values: TicketFilterValues, page: number): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status !== "open") params.set("status", values.status);
  if (values.tech !== "all") params.set("tech", values.tech);
  if (values.problemType !== "all") params.set("problemType", values.problemType);
  if (values.sort !== "created") params.set("sort", values.sort);
  if (values.due !== "all") params.set("due", values.due);
  if (values.customerId) params.set("customerId", values.customerId);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}
