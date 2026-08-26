import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightLeft,
  Check,
  Pencil,
  Printer,
  Receipt,
  Send,
  ThumbsDown,
  Wrench,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ActionForm } from "@/components/billing/action-form";
import { formatDate } from "@/components/billing/format";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import { EstimateStatusBadge } from "@/components/billing/status-badge";
import {
  approveEstimateAction,
  approveWithSignatureAction,
  convertEstimateAction,
  declineEstimateAction,
  markEstimateSentAction,
} from "../actions";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      ticket: { select: { id: true, number: true, subject: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      invoices: {
        orderBy: { number: "asc" },
        select: { id: true, number: true, status: true },
      },
    },
  });
  if (!estimate) notFound();

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const customerName =
    estimate.customer.businessName ||
    `${estimate.customer.firstName} ${estimate.customer.lastName}`;

  const converted = estimate.status === "CONVERTED";
  const canEdit = !converted;
  const canMarkSent = estimate.status === "DRAFT";
  const canApprove = ["DRAFT", "SENT", "DECLINED"].includes(estimate.status);
  const canDecline = ["DRAFT", "SENT", "APPROVED"].includes(estimate.status);
  const canConvert =
    ["DRAFT", "SENT", "APPROVED"].includes(estimate.status) &&
    estimate.lines.length > 0;

  const expired =
    estimate.expiresAt !== null &&
    estimate.expiresAt.getTime() < Date.now() &&
    (estimate.status === "DRAFT" || estimate.status === "SENT");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Estimate #${estimate.number}`}
        description={`Quoted ${formatDate(estimate.createdAt)} for ${customerName}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/print/estimates/${estimate.id}`} target="_blank">
                <Printer /> Print
              </Link>
            </Button>

            {canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/estimates/${estimate.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            ) : null}

            {canMarkSent ? (
              <ActionForm
                action={markEstimateSentAction}
                fields={{ id: estimate.id }}
                variant="outline"
                pendingLabel="Sending…"
              >
                <Send /> Mark sent
              </ActionForm>
            ) : null}

            {canApprove ? (
              <>
                <ActionForm
                  action={approveEstimateAction}
                  fields={{ id: estimate.id }}
                  variant="outline"
                  pendingLabel="Approving…"
                >
                  <Check /> Approve
                </ActionForm>
                <SignatureDialog
                  action={approveWithSignatureAction}
                  documentId={estimate.id}
                  title="Approve with signature"
                  description={`Have ${customerName} sign to authorise the work on estimate #${estimate.number}.`}
                  triggerLabel="Approve + sign"
                />
              </>
            ) : null}

            {canDecline ? (
              <ActionForm
                action={declineEstimateAction}
                fields={{ id: estimate.id }}
                variant="outline"
                pendingLabel="Saving…"
              >
                <ThumbsDown /> Decline
              </ActionForm>
            ) : null}

            {canConvert ? (
              <ActionForm
                action={convertEstimateAction}
                fields={{ id: estimate.id }}
                pendingLabel="Converting…"
              >
                <ArrowRightLeft /> Convert to invoice
              </ActionForm>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <EstimateStatusBadge status={estimate.status} />
        {expired ? (
          <span className="text-xs font-medium text-status-overdue">
            Expired {formatDate(estimate.expiresAt)}
          </span>
        ) : null}
        {estimate.invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/invoices/${invoice.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent hover:underline"
          >
            <Receipt className="size-3.5" />
            Invoice #{invoice.number}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-0">
              <Table>
                <THead>
                  <Tr>
                    <Th>Description</Th>
                    <Th className="w-[60px] text-right">Qty</Th>
                    <Th className="w-[110px] text-right">Rate</Th>
                    <Th className="w-[60px] text-center">Tax</Th>
                    <Th className="w-[120px] text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {estimate.lines.map((line) => (
                    <Tr key={line.id}>
                      <Td className="whitespace-normal">{line.description}</Td>
                      <Td className="text-right tabular-nums">{line.quantity}</Td>
                      <Td className="text-right tabular-nums">
                        {formatCents(line.unitPriceCents)}
                      </Td>
                      <Td className="text-center text-xs text-muted-foreground">
                        {line.taxable ? "Yes" : "No"}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatCents(line.quantity * line.unitPriceCents)}
                      </Td>
                    </Tr>
                  ))}
                  {estimate.lines.length === 0 ? (
                    <Tr>
                      <Td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No line items on this estimate yet.
                      </Td>
                    </Tr>
                  ) : null}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {estimate.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-[13px]">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatCents(totals.subtotalCents)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">
                  Tax ({formatBps(estimate.taxRateBps)})
                </span>
                <span className="tabular-nums">{formatCents(totals.taxCents)}</span>
              </div>
              <div className="my-1 h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-foreground">Estimated total</span>
                <span className="text-base font-semibold tabular-nums text-foreground">
                  {formatCents(totals.totalCents)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-[13px]">
              <MetaRow label="Customer">
                <Link
                  href={`/customers/${estimate.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {customerName}
                </Link>
              </MetaRow>
              {estimate.customer.email ? (
                <MetaRow label="Email">
                  <span className="text-muted-foreground">
                    {estimate.customer.email}
                  </span>
                </MetaRow>
              ) : null}
              <MetaRow label="Quoted">
                <span className="tabular-nums text-muted-foreground">
                  {formatDate(estimate.createdAt)}
                </span>
              </MetaRow>
              <MetaRow label="Expires">
                <span
                  className={cn(
                    "tabular-nums",
                    expired ? "font-medium text-status-overdue" : "text-muted-foreground",
                  )}
                >
                  {estimate.expiresAt ? formatDate(estimate.expiresAt) : "No expiry"}
                </span>
              </MetaRow>
              {estimate.approvedAt ? (
                <MetaRow label="Approved">
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(estimate.approvedAt)}
                  </span>
                </MetaRow>
              ) : null}
              {estimate.ticket ? (
                <MetaRow label="Ticket">
                  <Link
                    href={`/tickets/${estimate.ticket.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <Wrench className="size-3.5" />#{estimate.ticket.number}
                  </Link>
                </MetaRow>
              ) : null}
            </CardContent>
          </Card>

          {estimate.approvalSignatureDataUrl ? (
            <Card>
              <CardHeader>
                <CardTitle>Approval signature</CardTitle>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={estimate.approvalSignatureDataUrl}
                  alt={`Approval signature of ${customerName}`}
                  className="h-20 w-full rounded-md bg-white object-contain p-1"
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right">{children}</span>
    </div>
  );
}
