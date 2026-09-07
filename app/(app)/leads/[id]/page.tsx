import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { MessageSquareText } from "lucide-react";

import { TicketStatus } from "@/components/customers/status-pill";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyableId } from "@/components/ui/copyable-id";
import { ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
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
      {/*
        No headline figure: a lead is a name and a phone number, and inventing
        a number for it would put a zero where the object's identity belongs.
        `ObjectHeader` promotes the title into the top slot instead, so the
        page still opens exactly like a ticket or a customer does.
      */}
      <ObjectHeader
        back={{ label: "Leads", href: "/leads" }}
        title={lead.name}
        status={<StatusPill tone={meta.tone} label={meta.label} />}
        id={<CopyableId value={lead.id} label="lead id" />}
        meta={[
          {
            label: "Phone",
            value: lead.phone ? (
              <a href={`tel:${lead.phone}`} className="text-foreground hover:underline">
                {lead.phone}
              </a>
            ) : (
              <span className="text-faint-foreground">Not given</span>
            ),
          },
          {
            label: "Email",
            value: lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                title={lead.email}
                className="text-accent-soft-foreground hover:underline"
              >
                {lead.email}
              </a>
            ) : (
              <span className="text-faint-foreground">Not given</span>
            ),
          },
          { label: "Source", value: lead.source ?? "Unknown" },
          { label: "Received", value: format(lead.createdAt, "MMM d, h:mm a") },
          { label: "Last touched", value: leadAge(lead.updatedAt) },
          // The one question a lead exists to answer: did anything come of
          // it? At a glance here; the table below carries what it became and
          // what state that record is in now.
          {
            label: "Converted",
            value: lead.customer ? (
              <Link
                href={`/customers/${lead.customer.id}`}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                {lead.customer.businessName ||
                  `${lead.customer.firstName} ${lead.customer.lastName}`.trim()}
              </Link>
            ) : (
              <span className="text-faint-foreground">Not yet</span>
            ),
          },
        ]}
        actions={
          // Same width cap as the ticket and customer headers — see the note
          // there. `ObjectHeader`'s actions slot cannot wrap on its own.
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/*
          The whole reason the page exists. Phone, email, source and received
          are columns in the header now, so nothing sits between the enquiry
          and the person reading it.
        */}
        <Card>
          <CardHeader icon={MessageSquareText} title="What they said" />
          <CardContent>
            {lead.message ? (
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                {lead.message}
              </p>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">
                Nothing was written down with this enquiry.
              </p>
            )}
          </CardContent>
        </Card>

        {/*
          Related records as a small embedded table, not a stack of cards
          inside a card — the same shape the customer hub uses for its tickets
          and invoices, at two rows instead of eight.
        */}
        <Card>
          <CardHeader icon={ICONS.customer} title="Converted to" />
          {lead.customer || lead.ticket ? (
            <Table>
              <THead>
                <Tr>
                  <Th>Record</Th>
                  <Th className="text-right">Type</Th>
                </Tr>
              </THead>
              <TBody>
                {lead.customer ? (
                  <Tr>
                    <Td className="max-w-[10.5rem]">
                      <Link
                        href={`/customers/${lead.customer.id}`}
                        className="block truncate font-medium text-foreground hover:text-accent hover:underline"
                      >
                        {lead.customer.businessName ||
                          `${lead.customer.firstName} ${lead.customer.lastName}`.trim()}
                      </Link>
                    </Td>
                    <Td className="text-right text-muted-foreground">
                      Customer
                    </Td>
                  </Tr>
                ) : null}

                {lead.ticket ? (
                  <Tr>
                    <Td className="max-w-[10.5rem]">
                      <Link
                        href={`/tickets/${lead.ticket.id}`}
                        className="block truncate font-medium text-foreground hover:text-accent hover:underline"
                      >
                        <span className="rf-num">#{lead.ticket.number}</span>{" "}
                        {lead.ticket.subject}
                      </Link>
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex justify-end">
                        <TicketStatus status={lead.ticket.status} />
                      </span>
                    </Td>
                  </Tr>
                ) : null}
              </TBody>
            </Table>
          ) : (
            <CardContent>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                Nothing yet. Converting this lead creates (or links) a customer
                and can open a ticket in the same step.
              </p>
            </CardContent>
          )}
        </Card>
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

  const push = (customer: (typeof byEmail)[number], on: LeadMatch["on"]) => {
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
    if (
      samePhone(customer.phone, lead.phone) ||
      samePhone(customer.mobile, lead.phone)
    ) {
      push(customer, "phone");
    }
  }

  return out.slice(0, 5);
}
