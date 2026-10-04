import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { LineRows, TotalsBlock } from "@/components/public/line-rows";
import { StatusPill } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { dayWords, deadline, estimateWords, itemCount, whenWords } from "@/lib/portal-display";
import { taxLabel } from "@/lib/tax";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import { EstimateDecision } from "../../_components/estimate-decision";
import { BackLink, PortalCard, PortalShell } from "../../_components/shell";
import { loadPortalShop } from "../../_components/shop";

/** Scoped through the cookie, like the render; see the repair page for why. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Estimate · Repairs helper" };

  const estimate = await db.estimate.findFirst({
    where: {
      id,
      customerId: session.customerId,
      shopId: session.shopId,
      // A draft has not been sent; the customer must not learn it exists.
      status: { not: "DRAFT" },
    },
    select: { number: true },
  });
  return { title: estimate ? `Estimate #${estimate.number} · Repairs helper` : "Estimate · Repairs helper" };
}

/**
 * A quote, the way a customer wants to read it: the price in big type, what it
 * is for as simple rows, and one decision (approve, or no thanks) pinned to the
 * bottom of a phone while they read.
 */
export default async function PortalEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/estimates/${id}`);

  const [shop, estimate] = await Promise.all([
    loadPortalShop(customer.shopId),
    db.estimate.findFirst({
      where: {
        id,
        customerId: customer.id,
        shopId: customer.shopId,
        // Unsent means invisible: a draft 404s rather than rendering.
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        approvedAt: true,
        approvalSignatureDataUrl: true,
        notes: true,
        taxRateBps: true,
        taxRate: { select: { name: true } },
        lines: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, description: true, quantity: true, unitPriceCents: true, taxable: true },
        },
      },
    }),
  ]);
  if (!estimate) notFound();

  const now = requestNow();
  const zone = shop.timezone;
  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const total = formatCents(totals.totalCents);
  const words = estimateWords(estimate.status);
  const validUntil = estimate.expiresAt ? deadline(estimate.expiresAt, now, zone) : null;
  const expired = estimate.status === "SENT" && validUntil?.state === "overdue";
  const open = estimate.status === "SENT";

  return (
    <PortalShell shop={shop} customerName={`${customer.firstName} ${customer.lastName}`.trim()}>
      <BackLink href="/portal/home">Back to your repairs</BackLink>

      <div className="flex flex-col gap-6">
        {/* ------------------------------------------------- the price -- */}
        <PortalCard className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill size="md" tone={words.tone} label={words.label} />
            <span className="text-[14px] text-muted-foreground">Estimate #{estimate.number}</span>
          </div>
          <h1 className="text-[40px] font-bold leading-none tracking-tight tabular-nums">{total}</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {open
              ? `This is what ${shop.name} would charge. No work starts and nothing is charged until you approve.`
              : `Sent ${dayWords(estimate.createdAt, now, zone)}.`}
            {validUntil ? ` ${expired ? "It was valid until" : "Valid until"} ${validUntil.day}.` : ""}
          </p>
        </PortalCard>

        {/* ------------------------------------------------- decided -- */}
        {open ? null : (
          <PortalCard className="flex items-start gap-3 p-5 sm:p-6">
            {estimate.status === "DECLINED" ? (
              <XCircle className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-status-resolved" aria-hidden />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold">{STATUS_HEADLINE[estimate.status] ?? "This estimate is closed"}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                {estimate.approvedAt ? `Approved ${whenWords(estimate.approvedAt, now, zone)}. ` : ""}
                {STATUS_BLURB[estimate.status] ?? "Call the shop if you need to change anything."}
              </p>

              {estimate.approvalSignatureDataUrl ? (
                <figure className="mt-4 w-full max-w-[260px] rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={estimate.approvalSignatureDataUrl} alt="Your signature" className="h-[60px] w-full object-contain object-left" />
                  {/* Paper colours on purpose: the signature is shown on its white sheet in every theme. */}
                  <figcaption className="mt-1 border-t border-neutral-300 pt-1 text-[12px] text-neutral-600">Your signature</figcaption>
                </figure>
              ) : null}
            </div>
          </PortalCard>
        )}

        {/* ------------------------------------------- what it is for -- */}
        <section aria-labelledby="items-title" className="flex flex-col gap-3">
          <h2 id="items-title" className="text-xl font-semibold">
            What we would do <span className="text-muted-foreground">({itemCount(estimate.lines.length)})</span>
          </h2>
          <PortalCard className="overflow-hidden">
            <LineRows lines={estimate.lines} />
            <TotalsBlock
              rows={[
                { label: "Subtotal", value: formatCents(totals.subtotalCents) },
                { label: taxLabel(estimate.taxRate?.name, estimate.taxRateBps), value: formatCents(totals.taxCents) },
                { label: "Total", value: total, strong: true },
              ]}
            />
          </PortalCard>
        </section>

        {estimate.notes ? (
          <section aria-labelledby="notes-title" className="flex flex-col gap-2">
            <h2 id="notes-title" className="text-xl font-semibold">Notes from the shop</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{estimate.notes}</p>
          </section>
        ) : null}

        {/* ------------------------------------------- your answer -- */}
        {open ? <EstimateDecision estimateId={estimate.id} totalLabel={total} expired={expired} /> : null}
      </div>
    </PortalShell>
  );
}

const STATUS_HEADLINE: Record<string, string> = {
  APPROVED: "You approved this estimate",
  DECLINED: "You said no to this estimate",
  CONVERTED: "Approved, and now on your bill",
};

const STATUS_BLURB: Record<string, string> = {
  APPROVED: "The shop has the go-ahead and will get to work.",
  DECLINED: "Nothing will be charged. Call the shop if you change your mind; they can send it again.",
  CONVERTED: "The approved work has been billed. You will find it under Invoices in your repairs.",
};
