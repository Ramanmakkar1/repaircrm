import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { formatDate, formatDateTime } from "@/components/billing/format";
import { EstimateStatusBadge } from "@/components/billing/status-badge";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { requirePortalCustomer } from "@/lib/portal-session";
import { EstimateDecision } from "../../_components/estimate-decision";
import {
  BackLink,
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../../_components/shell";

export default async function PortalEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/estimates/${id}`);

  const estimate = await db.estimate.findFirst({
    where: { id, customerId: customer.id, shopId: customer.shopId },
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
      ticketId: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
        },
      },
    },
  });
  if (!estimate) notFound();

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const expired = estimate.status === "SENT" && isPast(estimate.expiresAt);

  return (
    <PortalShell
      shopName={customer.shop.name}
      customerName={`${customer.firstName} ${customer.lastName}`}
    >
      <BackLink href="/portal/home">Back to your portal</BackLink>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Estimate #{estimate.number}
          </h1>
          <EstimateStatusBadge status={estimate.status} />
        </div>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Prepared {formatDate(estimate.createdAt)}
          {estimate.expiresAt ? ` · valid until ${formatDate(estimate.expiresAt)}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <PortalCard>
          <PortalCardHeader
            title="What we'd do"
            description="No work starts and nothing is charged until you approve this."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold sm:px-6">Item</th>
                  <th className="w-16 px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="w-24 px-3 py-2.5 text-right font-semibold">Rate</th>
                  <th className="w-28 px-5 py-2.5 text-right font-semibold sm:px-6">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {estimate.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 sm:px-6">{line.description}</td>
                    <td className="px-3 py-3 text-right font-mono">{line.quantity}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {formatCents(line.unitPriceCents)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono sm:px-6">
                      {formatCents(line.quantity * line.unitPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
            <dl className="w-full max-w-xs space-y-2 text-[14px]">
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-mono text-muted-foreground">
                  {formatCents(totals.subtotalCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">
                  Sales tax ({formatBps(estimate.taxRateBps)})
                </dt>
                <dd className="font-mono text-muted-foreground">
                  {formatCents(totals.taxCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-border-strong pt-2.5">
                <dt className="font-semibold">Estimated total</dt>
                <dd className="font-mono text-[17px] font-bold">
                  {formatCents(totals.totalCents)}
                </dd>
              </div>
            </dl>
          </div>
        </PortalCard>

        {estimate.notes ? (
          <PortalCard className="px-5 py-5 sm:px-6">
            <h2 className="text-[13px] font-semibold">Notes from the shop</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-muted-foreground">
              {estimate.notes}
            </p>
          </PortalCard>
        ) : null}

        {/* --------------------------------------------------- your answer -- */}
        {estimate.status === "SENT" ? (
          <PortalCard className="px-5 py-5 sm:px-6">
            <h2 className="text-[15px] font-bold">Your decision</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              {expired
                ? "This estimate has passed its expiry date — you can still answer, but the shop may re-quote."
                : "Approve to give the shop the go-ahead, or decline if you'd rather not proceed."}
            </p>
            <div className="mt-4">
              <EstimateDecision estimateId={estimate.id} variant="full" />
            </div>
          </PortalCard>
        ) : (
          <PortalCard className="flex items-start gap-3 px-5 py-5 sm:px-6">
            {estimate.status === "DECLINED" ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-status-overdue" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-resolved" />
            )}
            <div>
              <h2 className="text-[15px] font-bold">
                {STATUS_HEADLINE[estimate.status] ?? "This estimate is closed"}
              </h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                {estimate.approvedAt
                  ? `Approved on ${formatDateTime(estimate.approvedAt)}. `
                  : ""}
                {STATUS_BLURB[estimate.status] ??
                  "Give the shop a call if you need to change anything."}
              </p>

              {estimate.approvalSignatureDataUrl ? (
                <div className="mt-4 w-[240px] rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={estimate.approvalSignatureDataUrl}
                    alt="Your signature"
                    className="h-[60px] w-full object-contain object-left"
                  />
                  <div className="mt-1 border-t border-neutral-300 pt-1 text-[10px] uppercase tracking-wider text-neutral-500">
                    Your signature
                  </div>
                </div>
              ) : null}
            </div>
          </PortalCard>
        )}
      </div>
    </PortalShell>
  );
}

/**
 * Module scope, not inline in the render: reading the clock during a render is
 * an impure call, and the whole app treats "now" as something passed in rather
 * than reached for (see components/tickets/ticket-meta.ts).
 */
function isPast(date: Date | null): boolean {
  return date !== null && date.getTime() < Date.now();
}

const STATUS_HEADLINE: Record<string, string> = {
  DRAFT: "Not ready yet",
  APPROVED: "You approved this estimate",
  DECLINED: "You declined this estimate",
  CONVERTED: "This estimate became an invoice",
};

const STATUS_BLURB: Record<string, string> = {
  DRAFT: "The shop is still putting this quote together.",
  APPROVED: "The shop has the go-ahead and will get to work.",
  DECLINED:
    "Nothing will be charged. Call the shop if you change your mind — they can re-issue it.",
  CONVERTED:
    "The approved work has been invoiced — you'll find it under Invoices in your portal.",
};
