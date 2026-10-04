import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareText, Wrench } from "lucide-react";

import { DetailHero } from "@/components/customers/detail-hero";
import { sourceLabel } from "@/components/customers/lead-facts";
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
import { Button } from "@/components/ui/button";
import { IconVisual, InitialsVisual, RecordCard } from "@/components/ui/record-card";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { formatIn } from "@/lib/dashboard/zone";
import { readUiPrefs } from "@/lib/prefs";

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

  return { title: lead ? `${lead.name} · Repairs helper` : "Enquiry · Repairs helper" };
}

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, prefs, zone] = await Promise.all([params, readUiPrefs(), loadShopZone(shopId)]);

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
  // Easy mode (the default) opens with the big header; Full keeps the object header.
  const easy = prefs.simple;

  // Matching and the problem-type list are only needed by the convert dialog —
  // skip both once the lead is already converted.
  const [matches, shop] = await Promise.all([
    isConverted ? Promise.resolve([]) : findMatches(shopId, lead),
    isConverted
      ? Promise.resolve(null)
      : db.shop.findUnique({ where: { id: shopId }, select: { settings: true } }),
  ]);

  // "Oct 3, 9:14 AM" on the shop's clock, not the server's.
  const received = formatIn(lead.createdAt.getTime(), zone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const actions = (
    <LeadActions
      easy={easy}
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
  );

  const convertedTo = lead.customer
    ? lead.customer.businessName || `${lead.customer.firstName} ${lead.customer.lastName}`.trim()
    : null;

  if (easy) {
    // Easy mode: the same header the customer page has (a big name, the phone
    // as a large tap-to-call link, the status in words) with ONE next step,
    // "Start a repair". Under it, what they said, as a speech bubble: the
    // reason the page exists comes before the facts.
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <DetailHero
          visual={<InitialsVisual name={lead.name} />}
          title={lead.name}
          status={<StatusPill tone={meta.tone} label={statusWord(status)} />}
          phone={lead.phone}
          contact={
            lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                data-touch-control
                className="inline-flex min-h-12 max-w-full items-center gap-2 text-base font-medium text-accent-soft-foreground hover:underline"
              >
                <ICONS.email className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{lead.email}</span>
              </a>
            ) : !lead.phone ? (
              <p className="text-base text-muted-foreground">No phone or email given.</p>
            ) : null
          }
          primary={
            isConverted ? (
              lead.ticket ? (
                <Button asChild size="lg" className="h-14 px-6 text-base [&_svg]:size-5">
                  <Link href={`/tickets/${lead.ticket.id}`}>
                    <Wrench aria-hidden />
                    Open repair #{lead.ticket.number}
                  </Link>
                </Button>
              ) : lead.customer ? (
                <Button asChild size="lg" className="h-14 px-6 text-base">
                  <Link href={`/customers/${lead.customer.id}`}>Open {convertedTo ?? "customer"}</Link>
                </Button>
              ) : null
            ) : (
              actions
            )
          }
        />

        <section aria-labelledby="said-title" className="flex flex-col gap-2">
          <h2 id="said-title" className="text-lg font-semibold">What they said</h2>
          <div className="flex items-start gap-3">
            <InitialsVisual name={lead.name} className="size-11 text-base sm:size-11 sm:text-base" />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3">
              {lead.message ? (
                <p className="whitespace-pre-wrap text-lg leading-relaxed text-foreground">{lead.message}</p>
              ) : (
                <p className="text-base text-muted-foreground">Nothing was written down with this enquiry.</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {received}
                {sourceLabel(lead.source) ? ` · ${sourceLabel(lead.source)}` : ""}
              </p>
            </div>
          </div>
        </section>

        <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3 sm:p-5">
          <EasyFact label="Came in by" value={sourceLabel(lead.source) ?? "Not known"} />
          <EasyFact label="Received" value={received} />
          <EasyFact label="Last touched" value={leadAge(lead.updatedAt, undefined, zone)} />
        </dl>

        {lead.customer || lead.ticket ? (
          <section aria-labelledby="became-title" className="flex flex-col gap-3">
            <h2 id="became-title" className="text-lg font-semibold">What it became</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {lead.customer && convertedTo ? (
                <li>
                  <RecordCard
                    href={`/customers/${lead.customer.id}`}
                    visual={<InitialsVisual name={convertedTo} />}
                    title={convertedTo}
                    subtitle="Customer"
                  />
                </li>
              ) : null}
              {lead.ticket ? (
                <li>
                  <RecordCard
                    href={`/tickets/${lead.ticket.id}`}
                    visual={<IconVisual icon={Wrench} />}
                    title={`Repair #${lead.ticket.number}`}
                    subtitle={lead.ticket.subject}
                    status={<TicketStatus status={lead.ticket.status} />}
                  />
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* No headline figure: a lead is a name and a phone number, and inventing
          a number for it would put a zero where the object's identity belongs.
          `ObjectHeader` promotes the title into the top slot instead, so the
          page still opens exactly like a ticket or a customer does. */}
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
            { label: "Received", value: received },
            { label: "Last touched", value: leadAge(lead.updatedAt, undefined, zone) },
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
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
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

/** Easy mode's status words: "Called" reads better at the counter than "Contacted". */
function statusWord(status: ReturnType<typeof asLeadStatus>): string {
  if (status === "CONTACTED") return "Called";
  if (status === "CONVERTED") return "Became a customer";
  return LEAD_STATUS_META[status].label;
}

function EasyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
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
