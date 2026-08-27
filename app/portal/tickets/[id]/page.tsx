import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/components/billing/format";
import { StatusProgress } from "@/components/tickets/status-progress";
import { ticketStatuses } from "@/components/tickets/ticket-meta";
import { db } from "@/lib/db";
import { requirePortalCustomer } from "@/lib/portal-session";
import {
  BackLink,
  EmptyRow,
  Field,
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../../_components/shell";

/**
 * One repair, as the customer is allowed to see it.
 *
 * WHAT IS DELIBERATELY NOT SELECTED
 * ---------------------------------
 *   diagnosticNotes   internal bench notes ("board is toast, upsell a refurb")
 *   asset.password    the device unlock code taken at intake
 *   asset.serial      not needed to recognise your own laptop
 *   customFields      free-form internal metadata
 *   assignedTo        staffing is the shop's business
 *   comments where isPublic = false
 *
 * These are excluded at the QUERY, not hidden in the markup. A field that is
 * never fetched cannot leak through an RSC payload, a stray `<pre>`, or the next
 * person to edit this file.
 */
export default async function PortalTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/tickets/${id}`);

  const ticket = await db.ticket.findFirst({
    // Both ids come from the cookie; only `id` came from the URL, and it is a
    // filter here, never a lookup key.
    where: { id, customerId: customer.id, shopId: customer.shopId },
    select: {
      id: true,
      number: true,
      subject: true,
      problemType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      asset: { select: { type: true, make: true, model: true } },
      comments: {
        where: { isPublic: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, subject: true, body: true, createdAt: true },
      },
    },
  });
  if (!ticket) notFound();

  const statuses = ticketStatuses(customer.shop.settings);
  const device = ticket.asset
    ? [ticket.asset.make, ticket.asset.model].filter(Boolean).join(" ") ||
      ticket.asset.type
    : null;

  return (
    <PortalShell
      shopName={customer.shop.name}
      customerName={`${customer.firstName} ${customer.lastName}`}
    >
      <BackLink href="/portal/home">Back to your portal</BackLink>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[14px] text-muted-foreground">
            Repair #{ticket.number}
          </span>
          <StatusBadge status={ticket.status} />
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">
          {ticket.subject}
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        <PortalCard className="px-5 py-5 sm:px-6">
          <h2 className="text-[13px] font-semibold text-foreground">Progress</h2>
          <div className="mt-3.5">
            <StatusProgress statuses={statuses} current={ticket.status} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Field label="Booked in">{formatDateTime(ticket.createdAt)}</Field>
            <Field label="Last update">{formatDateTime(ticket.updatedAt)}</Field>
            <Field label="Type of work">{ticket.problemType}</Field>
            <Field label="Device">{device ?? "—"}</Field>
          </dl>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-chip-accent-bg text-chip-accent-fg">
                  <MessageSquare className="size-3.5" />
                </span>
                Updates from the shop
              </span>
            }
            description="Everything the shop has shared with you about this repair."
          />

          {ticket.comments.length === 0 ? (
            <EmptyRow>
              No updates yet. The shop will post here as work progresses — and
              you&apos;ll get an email each time.
            </EmptyRow>
          ) : (
            <ol className="divide-y divide-border">
              {ticket.comments.map((comment) => (
                <li key={comment.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold">
                      {comment.subject ?? "Update"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {formatDateTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                    {comment.body}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
