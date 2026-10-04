import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { customerMatchClauses, documentNumber } from "@/lib/customers/phone-search";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { locationWhere } from "@/lib/location";
import { readUiPrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { RecordGrid } from "@/components/ui/record-card";
import { TicketCard } from "@/components/tickets/ticket-card";
import { RepairCard } from "@/components/tickets/repair-card";
import { RepairPager } from "@/components/tickets/repair-pager";
import { PickupCounter } from "@/components/tickets/pickup-counter";
import { loadPickupCards } from "@/components/tickets/pickup-data";
import { isPickupView, pickupSearchFields } from "@/components/tickets/pickup-card-facts";
import { RevealActiveTab } from "@/components/tickets/reveal-active-tab";
import {
  buildViewCounts,
  repairEmpty,
  repairViews,
  viewCount,
  viewIsActive,
  viewPatch,
} from "@/components/tickets/repair-card-facts";
import { SavedViewsControl } from "@/components/list/saved-views";
import {
  BulkBar,
  SelectCard,
  SelectionScope,
} from "@/components/list/selection";
import { TicketBulkActions } from "@/components/tickets/ticket-bulk-actions";
import {
  TicketToolbar,
  type TicketFilterValues,
} from "@/components/tickets/ticket-toolbar";
import {
  NEEDS_REPLY_FILTER,
  RESOLVED_STATUS,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";
import { OPEN_PART_STATUSES } from "@/components/tickets/part-meta";
import { needsReplyTicketIds } from "@/lib/needs-reply";
import { dueTodayRange } from "@/lib/sla";
import { checklistProgress, parseChecklist } from "@/lib/checklist";
import { listSavedViews } from "@/lib/saved-views-query";
import { normalizeViewQuery, savedViewHref } from "@/lib/saved-views";

export const metadata: Metadata = { title: "Repairs · Repairs helper" };

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
  const [{ shopId }, params, prefs, branch] = await Promise.all([
    requireUser(),
    searchParams,
    readUiPrefs(),
    locationWhere(),
  ]);
  // Easy mode: picture cards, big tabs with counts. Full mode keeps the dense
  // card board with bulk selection.
  const simple = prefs.simple;

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
  // Every branch narrows an already shop-scoped `base`; shopId is never
  // overridable from the query string.
  // The branch on screen, when one is selected. `locationWhere()` re-validates
  // the cookie against this shop, so it can only ever narrow to our own rows.
  //
  // `base` is everything EXCEPT the view (status / needs reply / due): it is
  // what the Easy mode tab counts are measured over, so a tab promises exactly
  // the number of repairs it will open under the same search and filters.
  const base: Prisma.TicketWhereInput = { shopId, ...branch };

  // One request-time clock: the due filters below and every row in the render
  // must agree on where "now" is.
  const requestNow = new Date();

  // Computed for every render, not just the filtered one: the same set draws
  // the dot on each row, so one query serves both. The shop row is read
  // alongside it, before the filters: "Due today" ends at midnight in the
  // shop's time zone (Shop.timezone), not the server's.
  const [replyIds, shop] = await Promise.all([
    needsReplyTicketIds(shopId, branch.locationId),
    db.shop.findUnique({ where: { id: shopId }, select: { settings: true, timezone: true } }),
  ]);
  const needsReply = new Set(replyIds);
  const timeZone = shop?.timezone ?? null;

  if (tech === "unassigned") {
    base.assignedToId = null;
  } else if (tech !== "all") {
    base.assignedToId = tech;
  }

  if (problemType !== "all") {
    base.problemType = problemType;
  }

  if (customerId) {
    base.customerId = customerId;
  }

  if (q) {
    const asNumber = documentNumber(q);
    const like = { contains: q, mode: "insensitive" as const };
    base.OR = [
      { subject: like },
      ...(await customerMatchClauses(shopId, q)).map((customer) => ({ customer })),
      // The IMEI / serial on the device, or the device itself ("pixel 8").
      { asset: { OR: [{ serial: like }, { make: like }, { model: like }] } },
      ...(asNumber !== null ? [{ number: asNumber }] : []),
    ];
  }

  const where: Prisma.TicketWhereInput = { ...base };

  if (status === NEEDS_REPLY_FILTER) {
    // An empty `in` is a legitimate "nothing matches" rather than a no-op, so
    // the empty state is honest when the inbox is clear.
    where.id = { in: [...needsReply] };
  } else if (status === "open") {
    where.status = { not: RESOLVED_STATUS };
  } else if (status !== "all") {
    where.status = status;
  }

  // Due filters only ever mean anything for work that is still open, so they
  // exclude resolved tickets regardless of which view is selected.
  if (due === "overdue") {
    where.dueDate = { lt: requestNow };
    where.status = { not: RESOLVED_STATUS };
  } else if (due === "today") {
    // From now to midnight on the shop's own calendar (the same cut Shop overview makes).
    where.dueDate = dueTodayRange(requestNow.getTime(), timeZone);
    where.status = { not: RESOLVED_STATUS };
  }

  // "Due soonest" puts undated tickets last — otherwise a null dueDate would
  // sort to the top and bury the work that actually has a deadline.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    sort === "due"
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
      : [{ createdAt: "desc" }];

  const [techs, problems, total, tickets, statusRows, overdueCount, needsReplyCount] = await Promise.all([
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
        // Easy mode only: the intake photo for the card's picture. Image files
        // only, oldest first (the check-in photo), a handful at most.
        ...(simple
          ? {
              attachments: {
                where: { mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/avif"] } },
                orderBy: { createdAt: "asc" as const },
                take: 8,
                select: { id: true, fileName: true },
              },
            }
          : {}),
        // The card shows these; the table it replaced did not, so they are
        // new to this query rather than left over from it.
        checklist: true,
        depositCents: true,
        pickedUpAt: true,
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
    // The tab counts (Easy mode only; Full mode does not show them).
    simple
      ? db.ticket.groupBy({ by: ["status"], where: base, _count: { _all: true } })
      : Promise.resolve(null),
    simple
      ? db.ticket.count({ where: { ...base, dueDate: { lt: requestNow }, status: { not: RESOLVED_STATUS } } })
      : Promise.resolve(0),
    simple
      ? db.ticket.count({ where: { ...base, id: { in: [...needsReply] } } })
      : Promise.resolve(0),
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

  // ------------------------------------------------------------ Easy mode ---
  // The register-style screen: one primary action, big tabs that carry their
  // counts, one big search, and a picture card per repair. Everything the Full
  // mode board can do is still here: the same filters, saved views, sort and
  // paging, and the bulk actions stay in Full mode.
  if (simple) {
    // A page number past the end (an old link, a list that shrank) lands on the
    // last page that exists instead of an empty list that says "no repairs".
    if (tickets.length === 0 && total > 0 && page > 1) redirect(pageHref(pageCount));

    const easyViews = repairViews(statuses);
    const counts = statusRows
      ? buildViewCounts(
          statusRows.map((row) => ({ status: row.status, count: row._count._all })),
          { needsReply: needsReplyCount, overdue: overdueCount },
        )
      : null;
    const from = (page - 1) * PAGE_SIZE + 1;
    const clearHref = filterHref({ q: "", status: "open", tech: "all", problemType: "all", due: "all" });
    const empty = repairEmpty({ status, due, filtered: isFiltered });

    // The view tabs are drawn once and shared by the ordinary Easy list and the
    // pickup counter below, so the two can never offer different tabs.
    const easyTabs = (
      <RevealActiveTab>
        <FilterTabs
          aria-label="Repair views"
          tabs={[
            ...easyViews.map((view) => ({
              label: view.label,
              href: filterHref(viewPatch(view, due)),
              active: viewIsActive(view, { status, due }),
              count: viewCount(view, counts),
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
              builtIn={easyViews.map((view) => ({
                label: view.label,
                query: normalizeViewQuery(
                  new URLSearchParams({ status: view.status, ...(view.due ? { due: view.due } : {}) }).toString(),
                ),
              }))}
            />
          }
        />
      </RevealActiveTab>
    );

    // Ready for pickup is the moment a customer collects a device: a pickup
    // counter instead of the list (cards with the money and one big button).
    if (isPickupView({ status, due })) {
      const cards = await loadPickupCards({ shopId, tickets, readyStatus: status });
      return (
        <PickupCounter
          cards={cards}
          now={now}
          timeZone={timeZone}
          total={total}
          q={q}
          tabs={easyTabs}
          searchFields={pickupSearchFields(filters)}
          clearHref={filterHref({ q: "" })}
          repairsHref={clearHref}
          showTotals={pageCount <= 1}
          pager={
            <RepairPager
              page={page}
              pageCount={pageCount}
              from={from}
              to={Math.min(page * PAGE_SIZE, total)}
              total={total}
              previousHref={pageHref(page - 1)}
              nextHref={pageHref(page + 1)}
            />
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Repairs"
          description="Every job, from check-in to pickup."
          actions={
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/tickets/new">
                <ACTIONS.add />
                New repair
              </Link>
            </Button>
          }
        />

        <div className="flex flex-col gap-3">
          {easyTabs}

          <TicketToolbar
            simple
            values={filters}
            problemTypes={problems.map((p) => p.problemType)}
            techs={techs}
          />
        </div>

        {tickets.length === 0 ? (
          <Card className="rounded-2xl shadow-none">
            <EmptyState
              icon={ICONS.ticket}
              title={empty.title}
              hint={empty.hint}
              action={
                empty.action === "new" ? (
                  <Button asChild variant="outline" size="lg">
                    <Link href="/tickets/new">
                      <ACTIONS.add />
                      New repair
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="lg">
                    <Link href={clearHref}>{empty.action === "open" ? "Show open repairs" : "Clear filters"}</Link>
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <RecordGrid>
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <RepairCard
                    now={now}
                    timeZone={timeZone}
                    className="h-full"
                    repair={{
                      ...ticket,
                      needsReply: needsReply.has(ticket.id),
                      checklist: checklistProgress(parseChecklist(ticket.checklist)),
                    }}
                  />
                </li>
              ))}
            </RecordGrid>
            <RepairPager
              page={page}
              pageCount={pageCount}
              from={from}
              to={Math.min(page * PAGE_SIZE, total)}
              total={total}
              previousHref={pageHref(page - 1)}
              nextHref={pageHref(page + 1)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Repairs"
        description="Track repair jobs from intake to pickup."
        actions={
          <Button asChild>
            <Link href="/tickets/new">
              <ACTIONS.add />
              New repair
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
        <RevealActiveTab>
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
        </RevealActiveTab>

        {/*
          One row of controls, not three. Due and Tech moved into the Filters
          dialog — they are the axes you set occasionally, and the button
          carries a count so a filter set from in there can never be invisible.
        */}
        <TicketToolbar
          values={filters}
          problemTypes={problems.map((p) => p.problemType)}
          techs={techs}
        />
      </div>

      {/*
        The selection covers the table and the bar together. Ids are the rows
        as rendered, in render order — the primitive prunes anything that
        leaves the list and reads shift-click ranges out of this array.
      */}
      <SelectionScope ids={tickets.map((ticket) => ticket.id)}>
        {tickets.length === 0 ? (
          <Card>
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
                    <Link
                      href={filterHref({
                        q: "",
                        status: "open",
                        tech: "all",
                        problemType: "all",
                        due: "all",
                      })}
                    >
                      Clear filters
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/tickets/new">
                      <ACTIONS.add />
                      New repair
                    </Link>
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {/*
              CARDS, NOT A TABLE.
              ------------------------------------------------------------
              This screen was a seven-column table under five rows of
              controls, and the owner's verdict on it was "complicated" —
              the second time a dense grid has been rejected here.

              A repair queue is not a spreadsheet. The question a front desk
              actually asks it is "what is on the bench and what is late",
              and a card answers that in one glance: whose it is, what it is,
              how it is going, who has it. The status is a word with a dot
              in the corner of the card.

              The table has not been thrown away — it is the right shape for
              money, and the invoice and estimate lists keep it.
            */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  now={now}
                  timeZone={timeZone}
                  ticket={{
                    ...ticket,
                    needsReply: needsReply.has(ticket.id),
                    checklist: checklistProgress(parseChecklist(ticket.checklist)),
                  }}
                  selectSlot={
                    <SelectCard
                      id={ticket.id}
                      label={`ticket #${ticket.number}`}
                      /*
                        Hidden until you hover, focus into the card, or have
                        already chosen something — so a queue you are only
                        reading stays a queue, and only turns into a list of
                        checkboxes once you start picking.
                      */
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=checked]]:opacity-100"
                    />
                  }
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
        )}

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
