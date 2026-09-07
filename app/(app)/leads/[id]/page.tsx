import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowUpRight,
  Clock,
  Mail,
  MessageSquareText,
  Phone,
  Tag,
  UserRound,
  Wrench,
} from "lucide-react";

import { LeadActions } from "@/components/leads/lead-actions";
import {
  LEAD_STATUS_META,
  asLeadStatus,
  leadAge,
  phoneTail,
  samePhone,
  ticketSubjectFromLead,
} from "@/components/leads/lead-meta";
import type { LeadMatch } from "@/components/leads/lead-state";
import { problemTypes } from "@/components/tickets/ticket-meta";
import { StatusPill } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const lead = await db.lead.findFirst({
    where: { id, shopId },
    select: { name: true },
  });

  return { title: lead ? `${lead.name} · RepairFlow` : "Lead · RepairFlow" };
}

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;

  const lead = await db.lead.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      source: true,
      message: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      customerId: true,
      ticketId: true,
      customer: {
        select: { id: true, firstName: true, lastName: true, businessName: true },
      },
      ticket: { select: { id: true, number: true, subject: true, status: true } },
    },
  });
  if (!lead) notFound();

  const status = asLeadStatus(lead.status);
  const meta = LEAD_STATUS_META[status];
  const isConverted = status === "CONVERTED";

  // Matching and the problem-type list are only needed by the convert dialog —
  // skip both once the lead is already converted.
  const [matches, shop] = await Promise.all([
    isConverted ? Promise.resolve([]) : findMatches(shopId, lead),
    isConverted
      ? Promise.resolve(null)
      : db.shop.findUnique({ where: { id: shopId }, select: { settings: true } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.name }]}
        title={lead.name}
        description={`${lead.source ?? "Unknown source"} · ${leadAge(lead.createdAt)}`}
        actions={
          <LeadActions
            lead={{
              id: lead.id,
              status: lead.status,
              values: {
                name: lead.name,
                email: lead.email ?? "",
                phone: lead.phone ?? "",
                source: lead.source ?? "Other",
                message: lead.message ?? "",
              },
            }}
            matches={matches}
            problemTypes={problemTypes(shop?.settings)}
            defaultSubject={ticketSubjectFromLead(lead)}
            canDelete={role === "OWNER"}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip icon={UserRound} size="sm" />
                <CardTitle className="truncate">Enquiry</CardTitle>
              </div>
              <StatusPill
                tone={meta.tone}
                label={meta.label}
                className="shrink-0"
              />
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Detail icon={Phone} label="Phone">
                  {lead.phone ? (
                    <a
                      href={`tel:${lead.phone}`}
                      className="font-semibold text-foreground hover:text-accent hover:underline"
                    >
                      {lead.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not given</span>
                  )}
                </Detail>

                <Detail icon={Mail} label="Email">
                  {lead.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      className="break-all font-semibold text-foreground hover:text-accent hover:underline"
                    >
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not given</span>
                  )}
                </Detail>

                <Detail icon={Tag} label="Source">
                  <span className="font-semibold text-foreground">
                    {lead.source ?? "Unknown"}
                  </span>
                </Detail>

                <Detail icon={Clock} label="Received">
                  <span className="font-semibold text-foreground">
                    {format(lead.createdAt, "MMM d, yyyy · h:mm a")}
                  </span>
                </Detail>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-5">
                <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquareText className="size-4" />
                  What they said
                </span>
                {lead.message ? (
                  <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">
                    {lead.message}
                  </p>
                ) : (
                  <p className="text-[14.5px] text-muted-foreground">
                    Nothing was written down with this enquiry.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Converted to</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {lead.customer ? (
                <RecordChip
                  href={`/customers/${lead.customer.id}`}
                  icon={UserRound}
                  title={
                    lead.customer.businessName ||
                    `${lead.customer.firstName} ${lead.customer.lastName}`.trim()
                  }
                  meta="Customer"
                />
              ) : null}

              {lead.ticket ? (
                <RecordChip
                  href={`/tickets/${lead.ticket.id}`}
                  icon={Wrench}
                  title={`#${lead.ticket.number} · ${lead.ticket.subject}`}
                  meta={lead.ticket.status}
                />
              ) : null}

              {!lead.customer && !lead.ticket ? (
                <p className="py-2 text-[13.5px] text-muted-foreground">
                  Nothing yet. Converting this lead creates (or links) a customer
                  and can open a ticket in the same step.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-[13.5px]">
              <TimelineRow
                label="Received"
                value={format(lead.createdAt, "MMM d, yyyy · h:mm a")}
              />
              <TimelineRow
                label="Last touched"
                value={format(lead.updatedAt, "MMM d, yyyy · h:mm a")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate matching
// ---------------------------------------------------------------------------

/**
 * Customers who might already BE this lead.
 *
 * Email is an exact (case-insensitive) comparison. Phones are the awkward half:
 * the same number is stored a dozen ways, so the query pre-filters on the LAST
 * FOUR DIGITS — contiguous in every common format, and cheap enough for SQL to
 * do — and the full normalised comparison happens in JS on that short list.
 *
 * Email matches are listed first because they are the stronger signal: two
 * people share a household landline far more often than an inbox.
 */
async function findMatches(
  shopId: string,
  lead: { email: string | null; phone: string | null },
): Promise<LeadMatch[]> {
  const select = {
    id: true,
    firstName: true,
    lastName: true,
    businessName: true,
    email: true,
    phone: true,
    mobile: true,
  } as const;

  const tail = phoneTail(lead.phone);

  const [byEmail, phoneCandidates] = await Promise.all([
    lead.email
      ? db.customer.findMany({
          where: { shopId, email: { equals: lead.email, mode: "insensitive" } },
          take: 5,
          select,
        })
      : Promise.resolve([]),
    tail
      ? db.customer.findMany({
          where: {
            shopId,
            OR: [{ phone: { contains: tail } }, { mobile: { contains: tail } }],
          },
          take: 25,
          select,
        })
      : Promise.resolve([]),
  ]);

  const out: LeadMatch[] = [];
  const seen = new Set<string>();

  const push = (
    customer: (typeof byEmail)[number],
    on: LeadMatch["on"],
  ) => {
    if (seen.has(customer.id)) return;
    seen.add(customer.id);
    out.push({
      id: customer.id,
      name:
        customer.businessName ||
        `${customer.firstName} ${customer.lastName}`.trim(),
      email: customer.email,
      phone: customer.phone ?? customer.mobile,
      on,
    });
  };

  for (const customer of byEmail) push(customer, "email");
  for (const customer of phoneCandidates) {
    if (samePhone(customer.phone, lead.phone) || samePhone(customer.mobile, lead.phone)) {
      push(customer, "phone");
    }
  }

  return out.slice(0, 5);
}

// ---------------------------------------------------------------------------

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-[14.5px]">{children}</span>
    </div>
  );
}

function RecordChip({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] font-semibold text-foreground">
          {title}
        </span>
        <span className="text-[12.5px] text-muted-foreground">{meta}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-faint-foreground" />
    </Link>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
