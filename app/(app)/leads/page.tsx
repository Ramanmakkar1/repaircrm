import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmbedSnippet } from "@/components/leads/embed-snippet";
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  OPEN_LEAD_STATUSES,
  asLeadStatus,
  isFreshLead,
  leadAge,
  messagePreview,
} from "@/components/leads/lead-meta";
import {
  BulkBar,
  SelectAll,
  SelectRow,
  SelectionScope,
} from "@/components/list/selection";
import { LeadBulkActions } from "@/components/leads/lead-bulk-actions";
import { RowLink } from "@/components/list/row-link";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/comms";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Leads · RepairFlow" };

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function one(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  // "open" is the default view: NEW + CONTACTED, i.e. everything still owed a
  // phone call. Converted and closed leads are history and stay out of the way.
  const status = one(params.status, "open");

  const where: Prisma.LeadWhereInput = { shopId };
  if (status === "open") {
    where.status = { in: OPEN_LEAD_STATUSES };
  } else if (LEAD_STATUSES.includes(status as never)) {
    where.status = status as Prisma.LeadWhereInput["status"];
  }

  const [shop, statusRows, leads] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { slug: true } }),
    // One grouped count feeds every tab — no per-tab query.
    db.lead.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        source: true,
        message: true,
        status: true,
        createdAt: true,
        customerId: true,
        ticketId: true,
      },
    }),
  ]);

  const counts: Record<string, number> = { open: 0, all: 0 };
  for (const row of statusRows) {
    counts[row.status] = row._count._all;
    counts.all += row._count._all;
    if (OPEN_LEAD_STATUSES.includes(row.status)) counts.open += row._count._all;
  }

  // One clock for the whole render, so two rows drawn a millisecond apart can
  // never disagree about whether a lead is still "fresh".
  const now = new Date();
  const nothingAtAll = counts.all === 0;

  // Every view carries its count: on an inbox that is the whole point — the
  // front desk needs to see that four new enquiries are waiting without
  // clicking into the filter to find out.
  const views = [
    { key: "open", label: "Open" },
    ...LEAD_STATUSES.map((key) => ({ key, label: LEAD_STATUS_META[key].label })),
    { key: "all", label: "All" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Leads"
        description="Every enquiry that hasn't become a customer yet — web forms, phone calls and walk-ins."
        actions={
          <Button asChild>
            <Link href="/leads/new">
              <ACTIONS.add />
              New Lead
            </Link>
          </Button>
        }
      />

      <FilterTabs
        aria-label="Lead views"
        tabs={views.map((view) => ({
          label: view.label,
          href: view.key === "open" ? "/leads" : `/leads?status=${view.key}`,
          active: status === view.key,
          count: counts[view.key] ?? 0,
        }))}
      />

      {/*
        Selection wraps the table AND the bar: both read the same ids, and the
        provider itself renders no element, so the card stays a direct child of
        the page's flex column.
      */}
      <SelectionScope ids={leads.map((lead) => lead.id)}>
        <Card className="overflow-hidden">
          <CardContent className="px-0 py-0">
            {leads.length === 0 ? (
              <EmptyState
                icon={ICONS.inbound}
                title={nothingAtAll ? "No leads yet" : "Nothing in this view"}
                hint={
                  nothingAtAll
                    ? "Log a phone enquiry, or drop the form below onto your website so the inbox fills itself."
                    : "Try another view — the enquiries are all still here."
                }
                action={
                  nothingAtAll ? (
                    <Button asChild>
                      <Link href="/leads/new">
                        <ACTIONS.add />
                        New Lead
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" asChild>
                      <Link href="/leads">Show open leads</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <SelectAll />
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Email</Th>
                    <Th>Source</Th>
                    <Th>Enquiry</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Received</Th>
                  </Tr>
                </THead>
                <TBody>
                  {leads.map((lead) => {
                    const meta = LEAD_STATUS_META[asLeadStatus(lead.status)];
                    const fresh = isFreshLead(lead, now);

                    return (
                      <RowLink key={lead.id} href={`/leads/${lead.id}`}>
                        <SelectRow id={lead.id} label={lead.name} />
                        <Td>
                          <span className="flex items-center gap-1.5">
                            {/* A NEW lead under a day old. The cheapest possible
                                "this one is still warm, call them" mark, and it
                                disappears on its own once the lead is answered
                                or goes cold. */}
                            {fresh ? (
                              <span
                                title="New today — nobody has called them yet"
                                className="size-[7px] shrink-0 rounded-full bg-accent"
                              >
                                <span className="sr-only">New today</span>
                              </span>
                            ) : null}
                            <Link
                              href={`/leads/${lead.id}`}
                              className="block max-w-[180px] truncate font-semibold text-foreground hover:underline"
                              title={lead.name}
                            >
                              {lead.name}
                            </Link>
                            {lead.customerId ? (
                              <span className="shrink-0 rounded-sm bg-chip-accent-bg px-1.5 py-0.5 text-[11.5px] font-semibold leading-none text-chip-accent-fg">
                                Customer
                              </span>
                            ) : null}
                            {lead.ticketId ? (
                              <span className="shrink-0 rounded-sm bg-chip-accent-bg px-1.5 py-0.5 text-[11.5px] font-semibold leading-none text-chip-accent-fg">
                                Ticket
                              </span>
                            ) : null}
                          </span>
                        </Td>

                        <Td className={lead.phone ? "rf-num" : "text-faint-foreground"}>
                          {lead.phone ?? "—"}
                        </Td>

                        <Td className={lead.email ? "text-muted-foreground" : "text-faint-foreground"}>
                          <span className="block max-w-[200px] truncate">
                            {lead.email ?? "—"}
                          </span>
                        </Td>

                        <Td className="text-muted-foreground">
                          {lead.source ?? "—"}
                        </Td>

                        <Td className="text-muted-foreground">
                          <span
                            className="block max-w-[280px] truncate"
                            title={lead.message ?? undefined}
                          >
                            {lead.message ? messagePreview(lead.message, 90) : "—"}
                          </span>
                        </Td>

                        <Td>
                          <StatusPill tone={meta.tone} label={meta.label} />
                        </Td>

                        <Td className="rf-num text-right text-[12.5px] text-muted-foreground">
                          {leadAge(lead.createdAt, now)}
                        </Td>
                      </RowLink>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <BulkBar noun="lead">
          <LeadBulkActions />
        </BulkBar>
      </SelectionScope>

      {/*
        The embed snippet is the whole point of the public endpoint, so it is
        loud while the inbox is empty and quiet — but still findable — once
        leads are arriving.
      */}
      {nothingAtAll ? (
        <EmbedSnippet
          shopSlug={shop?.slug ?? "your-shop"}
          endpoint={`${appUrl()}/api/leads`}
        />
      ) : (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            Website form snippet
          </summary>
          <div className="pt-3">
            <EmbedSnippet
              shopSlug={shop?.slug ?? "your-shop"}
              endpoint={`${appUrl()}/api/leads`}
            />
          </div>
        </details>
      )}
    </div>
  );
}
