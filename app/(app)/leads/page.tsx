import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";

import { EmbedSnippet } from "@/components/leads/embed-snippet";
import { LeadCard } from "@/components/leads/lead-card";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LEAD_STATUSES, OPEN_LEAD_STATUSES } from "@/components/leads/lead-meta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/comms";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Leads · RepairFlow" };

// Reads live shop data on every request; nothing here is safe to prerender.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;

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
    // One grouped count feeds every pill — no per-pill query.
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

  // One clock for the whole render, so two cards drawn a millisecond apart can
  // never disagree about whether a lead is still "fresh".
  const now = new Date();
  const nothingAtAll = counts.all === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ICONS.lead}
        title="Leads"
        description="Every enquiry that hasn't become a customer yet — web forms, phone calls and walk-ins."
        actions={
          <Button asChild>
            <Link href="/leads/new">
              <Plus />
              New Lead
            </Link>
          </Button>
        }
      />

      <LeadFilters status={status} counts={counts} />

      {leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.inbound}
            title={nothingAtAll ? "No leads yet" : "Nothing in this view"}
            hint={
              nothingAtAll
                ? "Log a phone enquiry, or drop the form below onto your website so the inbox fills itself."
                : "Try another filter — the enquiries are all still here."
            }
            action={
              nothingAtAll ? (
                <Button asChild>
                  <Link href="/leads/new">
                    <Plus />
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
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} now={now} />
          ))}
        </div>
      )}

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
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-surface-hover px-4 py-2 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            Website form snippet
          </summary>
          <div className="pt-4">
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
