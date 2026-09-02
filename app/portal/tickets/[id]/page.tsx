import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/badge";
import { ICONS } from "@/components/ui/icons";
import { formatDateTime } from "@/components/billing/format";
import { PhotoUpload } from "@/components/portal/photo-upload";
import { ReplyBox } from "@/components/portal/reply-box";
import { fileKind, formatBytes } from "@/components/tickets/attachment-meta";
import { StatusProgress } from "@/components/tickets/status-progress";
import { ticketStatuses } from "@/components/tickets/ticket-meta";
import { db } from "@/lib/db";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import {
  BackLink,
  EmptyRow,
  Field,
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../../_components/shell";

const MessageIcon = ICONS.message;
const AttachmentIcon = ICONS.attachment;

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

/**
 * The tab title carries the repair number, because a customer chasing a repair
 * usually has three of these tabs open. Scoped through the cookie exactly like
 * the render below — `getPortalSession` rather than `requirePortalCustomer`
 * because metadata must not redirect; the page itself does the guarding.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Your repair · RepairFlow" };

  const ticket = await db.ticket.findFirst({
    where: { id, customerId: session.customerId, shopId: session.shopId },
    select: { number: true },
  });
  return {
    title: ticket
      ? `Repair #${ticket.number} · RepairFlow`
      : "Your repair · RepairFlow",
  };
}

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
        select: {
          id: true,
          subject: true,
          body: true,
          createdAt: true,
          // Who said it, and nothing more about them: a null author is the
          // customer's own message, which the timeline labels differently.
          authorId: true,
        },
      },
      // ONLY the customer's own uploads. Bench photos and the tech's log dumps
      // are internal, and the way to keep them internal is to never select them.
      attachments: {
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          path: true,
          createdAt: true,
        },
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
                  <MessageIcon className="size-3.5" />
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
              {ticket.comments.map((comment) => {
                // A null author is the customer's own message. Tinting those
                // means the thread reads as a conversation rather than a
                // notice board.
                const mine = comment.authorId === null;
                return (
                  <li
                    key={comment.id}
                    className={mine ? "bg-surface-hover px-5 py-4 sm:px-6" : "px-5 py-4 sm:px-6"}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[14px] font-semibold">
                        {mine ? "You" : (comment.subject ?? "Update")}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                      {comment.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="border-t border-border">
            <ReplyBox ticketId={ticket.id} />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-chip-accent-bg text-chip-accent-fg">
                  <AttachmentIcon className="size-3.5" />
                </span>
                Photos you&apos;ve sent
              </span>
            }
            description="A picture of the fault often saves a phone call."
          />

          {ticket.attachments.length === 0 ? (
            <EmptyRow>
              Nothing sent yet. Add a photo below and the shop will see it on
              your repair.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {ticket.attachments.map((file) => (
                <li key={file.id} className="px-5 py-3.5 sm:px-6">
                  <a
                    href={file.path}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3.5"
                  >
                    {fileKind(file.mimeType) === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={file.path}
                        alt={file.fileName}
                        className="size-11 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface-hover">
                        <AttachmentIcon className="size-4 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-foreground">
                        {file.fileName}
                      </span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {formatBytes(file.sizeBytes)} · {formatDateTime(file.createdAt)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border">
            <PhotoUpload ticketId={ticket.id} />
          </div>
        </PortalCard>
      </div>
    </PortalShell>
  );
}
