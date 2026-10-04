import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MapPin, Phone, Receipt } from "lucide-react";

import { PhotoUpload } from "@/components/portal/photo-upload";
import { ReplyBox } from "@/components/portal/reply-box";
import { RepairStages } from "@/components/public/repair-stages";
import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { fileKind, formatBytes } from "@/components/tickets/attachment-meta";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconVisual, MetaChip, RecordCard } from "@/components/ui/record-card";
import { refundAwareTotals } from "@/components/billing/refund-math";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import {
  deviceName,
  devicePicture,
  estimateWords,
  invoiceWords,
  repairWords,
  telHref,
  whenWords,
} from "@/lib/portal-display";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import { BackLink, Field, PortalCard, PortalShell } from "../../_components/shell";
import { loadPortalShop } from "../../_components/shop";

/**
 * One repair, as the customer is allowed to see it: "where is my device, and
 * do I need to do anything?" answered at the top, in their words, with one
 * button for the next step.
 *
 * WHAT IS DELIBERATELY NOT SELECTED
 * ---------------------------------
 *   diagnosticNotes   internal bench notes ("board is toast, upsell a refurb")
 *   asset.password    the device unlock code taken at intake
 *   asset.serial      not needed to recognise your own laptop
 *   subject           the shop's own title for the job, written for staff
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
 * the render below: `getPortalSession` rather than `requirePortalCustomer`
 * because metadata must not redirect; the page itself does the guarding.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Your repair · Repairs helper" };

  const ticket = await db.ticket.findFirst({
    where: { id, customerId: session.customerId, shopId: session.shopId },
    select: { number: true },
  });
  return { title: ticket ? `Repair #${ticket.number} · Repairs helper` : "Your repair · Repairs helper" };
}

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/tickets/${id}`);
  const scope = { customerId: customer.id, shopId: customer.shopId };

  const [shop, ticket] = await Promise.all([
    loadPortalShop(customer.shopId),
    db.ticket.findFirst({
      // Both ids come from the cookie; only `id` came from the URL, and it is a
      // filter here, never a lookup key.
      where: { id, ...scope },
      select: {
        id: true,
        number: true,
        problemType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
            // customer's own message, which the conversation draws on the right.
            authorId: true,
          },
        },
        // ONLY the customer's own uploads. Bench photos and the tech's log dumps
        // are internal, and the way to keep them internal is to never select them.
        attachments: {
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    }),
  ]);
  if (!ticket) notFound();

  // The price of this repair: its sent estimates and bills, through the same
  // cookie scope (a draft is not the customer's business yet).
  const [estimates, invoices] = await Promise.all([
    db.estimate.findMany({
      where: { ...scope, ticketId: ticket.id, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      },
    }),
    db.invoice.findMany({
      where: { ...scope, ticketId: ticket.id, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        dueDate: true,
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
        refunds: { select: { amountCents: true, status: true } },
      },
    }),
  ]);

  const now = requestNow();
  const zone = shop.timezone;
  const device = deviceName(ticket.asset);
  const words = repairWords(ticket.status, device);

  const quotes = estimates.map((estimate) => ({
    ...estimate,
    totalCents: calcTotals(estimate.lines, estimate.taxRateBps).totalCents,
    words: estimateWords(estimate.status),
  }));
  const bills = invoices.map((invoice) => {
    const totals = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
    return {
      ...invoice,
      totals,
      owed: invoice.status === "VOID" ? 0 : Math.max(totals.balanceCents, 0),
      words: invoiceWords({
        status: invoice.status,
        totalCents: totals.totalCents,
        paidCents: totals.netPaidCents,
        dueDate: invoice.dueDate,
        nowMs: now,
        zone,
      }),
    };
  });
  const quoteToAnswer = quotes.find((quote) => quote.status === "SENT");
  const billToPay = bills.find((bill) => bill.owed > 0);

  return (
    <PortalShell shop={shop} customerName={`${customer.firstName} ${customer.lastName}`.trim()}>
      <BackLink href="/portal/home">Back to your repairs</BackLink>

      <div className="flex flex-col gap-6">
        {/* ---------------------------------------------------- the answer -- */}
        <PortalCard className="overflow-hidden">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-6">
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-white sm:size-36 sm:aspect-auto">
              <Image src={devicePicture(ticket.asset)} alt="" fill sizes="(max-width: 640px) 100vw, 144px" className="object-contain p-3" priority />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill size="md" tone={words.tone} label={words.label} />
                <span className="text-[14px] text-muted-foreground">Repair #{ticket.number}</span>
              </div>
              <h1 className="text-[26px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{words.headline}</h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{words.next}</p>
            </div>
          </div>

          <div className="border-t border-border px-4 py-5 sm:px-6">
            <RepairStages stage={words.stage} />
          </div>

          <NextStep
            ready={words.stage === 2}
            needsAnswer={words.needsYou && words.stage === 1}
            quote={quoteToAnswer}
            bill={billToPay}
            phone={shop.phone}
            mapUrl={shop.mapUrl}
          />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border px-4 py-5 sm:grid-cols-4 sm:px-6">
            <Field label="Device">{device ?? "Not given"}</Field>
            <Field label="What is wrong">{ticket.problemType || "Not given"}</Field>
            <Field label="Booked in">{whenWords(ticket.createdAt, now, zone)}</Field>
            <Field label="Last update">{whenWords(ticket.updatedAt, now, zone)}</Field>
          </dl>
        </PortalCard>

        {/* ------------------------------------------------------ the price -- */}
        {quotes.length > 0 || bills.length > 0 ? (
          <section aria-labelledby="price-title" className="flex flex-col gap-3">
            <h2 id="price-title" className="text-xl font-semibold">Price</h2>
            <ul className="flex flex-col gap-3">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <RecordCard
                    href={`/portal/estimates/${quote.id}`}
                    visual={<IconVisual icon={FileText} />}
                    title={`Estimate #${quote.number}`}
                    subtitle={quote.status === "SENT" ? "Tap to read it and say yes or no." : "The price the shop quoted."}
                    meta={
                      <>
                        <StatusPill size="md" tone={quote.words.tone} label={quote.words.label} />
                        <MetaChip>Total {formatCents(quote.totalCents)}</MetaChip>
                      </>
                    }
                  />
                </li>
              ))}
              {bills.map((bill) => (
                <li key={bill.id}>
                  <RecordCard
                    href={`/portal/invoices/${bill.id}`}
                    visual={<IconVisual icon={Receipt} />}
                    title={`Invoice #${bill.number}`}
                    subtitle={bill.owed > 0 ? `${formatCents(bill.owed)} to pay` : bill.status === "VOID" ? "Cancelled, nothing to pay" : "Paid in full, thank you"}
                    meta={
                      <>
                        <StatusPill size="md" tone={bill.words.tone} label={bill.words.label} />
                        <MetaChip>Total {formatCents(bill.totals.totalCents)}</MetaChip>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------------------------------------------------- messages -- */}
        <section id="message" aria-labelledby="messages-title" className="flex scroll-mt-4 flex-col gap-3">
          <div>
            <h2 id="messages-title" className="text-xl font-semibold">Messages</h2>
            <p className="text-[15px] text-muted-foreground">Everything {shop.name} has told you about this repair, and your replies.</p>
          </div>
          <PortalCard>
            {ticket.comments.length === 0 ? (
              <p className="px-4 py-8 text-center text-[15px] text-muted-foreground sm:px-6">
                No messages yet. The shop posts here as the work moves on, and emails you each time.
              </p>
            ) : (
              <ol className="flex flex-col gap-4 px-4 py-5 sm:px-6">
                {ticket.comments.map((comment) => {
                  const mine = comment.authorId === null;
                  return (
                    <li key={comment.id} className={cn("flex max-w-[88%] flex-col gap-1", mine ? "items-end self-end" : "items-start")}>
                      <span className="px-1 text-[13px] text-muted-foreground">
                        {mine ? "You" : shop.name} · {whenWords(comment.createdAt, now, zone)}
                      </span>
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                          mine ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md bg-surface-hover text-foreground",
                        )}
                      >
                        {!mine && comment.subject ? <p className="mb-1 font-semibold">{comment.subject}</p> : null}
                        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="border-t border-border">
              <ReplyBox ticketId={ticket.id} />
            </div>
          </PortalCard>
        </section>

        {/* ------------------------------------------------------ photos -- */}
        <section aria-labelledby="photos-title" className="flex flex-col gap-3">
          <div>
            <h2 id="photos-title" className="text-xl font-semibold">Your photos</h2>
            <p className="text-[15px] text-muted-foreground">A picture of the problem often saves a phone call.</p>
          </div>
          <PortalCard>
            {ticket.attachments.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
                {ticket.attachments.map((file) => (
                  <li key={file.id} className="min-w-0">
                    <a
                      href={`/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-12 flex-col gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {fileKind(file.mimeType) === "image" ? (
                        // A customer's own upload, served by /files; not a static asset next/image can size.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/files/${file.id}`} alt={file.fileName} className="aspect-square w-full rounded-xl border border-border object-cover" />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center rounded-xl border border-border bg-surface-hover text-[13px] font-semibold text-muted-foreground">
                          File
                        </span>
                      )}
                      <span className="truncate text-[13px] font-medium">{file.fileName}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {formatBytes(file.sizeBytes)} · {whenWords(file.createdAt, now, zone)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={ticket.attachments.length > 0 ? "border-t border-border" : undefined}>
              <PhotoUpload ticketId={ticket.id} />
            </div>
          </PortalCard>
        </section>
      </div>
    </PortalShell>
  );
}

/**
 * The one button for what happens next, chosen by the repair's state: go and
 * collect it, answer the estimate, reply to the shop, or pay the bill. Nothing
 * to do: no button (the message box below is the way to talk to the shop).
 */
function NextStep({
  ready,
  needsAnswer,
  quote,
  bill,
  phone,
  mapUrl,
}: {
  ready: boolean;
  needsAnswer: boolean;
  quote?: { id: string; number: number; totalCents: number };
  bill?: { id: string; owed: number };
  phone: string | null;
  mapUrl: string;
}) {
  let main: React.ReactNode = null;
  let extra: React.ReactNode = null;

  if (ready && (mapUrl || phone)) {
    main = mapUrl ? (
      <a href={mapUrl} target="_blank" rel="noreferrer">
        <MapPin aria-hidden />
        Get directions to the shop
      </a>
    ) : (
      <a href={telHref(phone ?? "")}>
        <Phone aria-hidden />
        Call {phone}
      </a>
    );
    if (mapUrl && phone) {
      extra = (
        <Button asChild size="lg" variant="outline" className={BIG_BUTTON}>
          <a href={telHref(phone)}>
            <Phone aria-hidden />
            Call {phone}
          </a>
        </Button>
      );
    }
  } else if (quote) {
    main = <Link href={`/portal/estimates/${quote.id}`}>Review the estimate ({formatCents(quote.totalCents)})</Link>;
  } else if (needsAnswer) {
    main = <a href="#message">Reply to the shop</a>;
  } else if (bill) {
    main = <Link href={`/portal/invoices/${bill.id}`}>Pay {formatCents(bill.owed)}</Link>;
  }

  if (!main) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-5 sm:flex-row sm:px-6">
      <Button asChild size="lg" className={cn(HUGE_BUTTON, "sm:w-auto")}>
        {main}
      </Button>
      {extra}
    </div>
  );
}
