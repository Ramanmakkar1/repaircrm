import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, FileText, Pencil, Printer, Send, Wrench } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ActionForm, ConfirmActionDialog } from "@/components/billing/action-form";
import { formatDate, formatDateTime, isOverdue } from "@/components/billing/format";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
import {
  markInvoiceSentAction,
  saveInvoiceSignatureAction,
  takePaymentAction,
  voidInvoiceAction,
} from "../actions";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      ticket: { select: { id: true, number: true, subject: true } },
      estimate: { select: { id: true, number: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { takenBy: { select: { name: true } } },
      },
    },
  });
  if (!invoice) notFound();

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  const customerName =
    invoice.customer.businessName ||
    `${invoice.customer.firstName} ${invoice.customer.lastName}`;

  const isVoid = invoice.status === "VOID";
  const canEdit = invoice.status === "DRAFT" || invoice.status === "SENT";
  const canMarkSent = invoice.status === "DRAFT";
  const canTakePayment = !isVoid && totals.balanceCents > 0;
  const hasPayments = invoice.payments.length > 0;
  const overdue = isOverdue(invoice.dueDate, totals.balanceCents);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Invoice #${invoice.number}`}
        description={`Raised ${formatDate(invoice.createdAt)} for ${customerName}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/print/invoices/${invoice.id}`} target="_blank">
                <Printer /> Print
              </Link>
            </Button>

            {canEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            ) : null}

            {canMarkSent ? (
              <ActionForm
                action={markInvoiceSentAction}
                fields={{ id: invoice.id }}
                variant="outline"
                pendingLabel="Sending…"
              >
                <Send /> Mark sent
              </ActionForm>
            ) : null}

            {!isVoid ? (
              <SignatureDialog
                action={saveInvoiceSignatureAction}
                documentId={invoice.id}
                title="Collect signature"
                description={`Have ${customerName} sign to acknowledge invoice #${invoice.number}.`}
                triggerLabel={
                  invoice.signatureDataUrl ? "Re-sign" : "Collect signature"
                }
              />
            ) : null}

            {role === "OWNER" && !isVoid ? (
              <ConfirmActionDialog
                action={voidInvoiceAction}
                fields={{ id: invoice.id }}
                triggerLabel="Void"
                triggerIcon={<Ban />}
                title={`Void invoice #${invoice.number}?`}
                description="The invoice stays on record but stops counting as money owed. This cannot be undone."
                confirmLabel="Void invoice"
                disabled={hasPayments}
                disabledReason="This invoice has payments recorded against it — refund and remove them first."
              />
            ) : null}

            {canTakePayment ? (
              <PaymentDialog
                action={takePaymentAction}
                invoiceId={invoice.id}
                balanceCents={totals.balanceCents}
                customerCreditCents={invoice.customer.creditBalanceCents}
                customerName={customerName}
              />
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <InvoiceStatusBadge status={invoice.status} />
        {overdue ? (
          <span className="text-xs font-medium text-status-overdue">
            Overdue since {formatDate(invoice.dueDate)}
          </span>
        ) : null}
        {invoice.estimate ? (
          <Link
            href={`/estimates/${invoice.estimate.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent hover:underline"
          >
            <FileText className="size-3.5" />
            Converted from estimate #{invoice.estimate.number}
          </Link>
        ) : null}
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
                    <Th className="w-[130px]">Serial</Th>
                    <Th className="w-[60px] text-right">Qty</Th>
                    <Th className="w-[100px] text-right">Rate</Th>
                    <Th className="w-[60px] text-center">Tax</Th>
                    <Th className="w-[110px] text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {invoice.lines.map((line) => (
                    <Tr key={line.id}>
                      <Td className="whitespace-normal">{line.description}</Td>
                      <Td className="font-mono text-xs text-muted-foreground">
                        {line.serial || "—"}
                      </Td>
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
                  {invoice.lines.length === 0 ? (
                    <Tr>
                      <Td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No line items on this invoice yet.
                      </Td>
                    </Tr>
                  ) : null}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {invoice.payments.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Nothing collected yet.
                </p>
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th className="w-[170px]">Date</Th>
                      <Th className="w-[120px]">Method</Th>
                      <Th>Reference</Th>
                      <Th className="w-[130px]">Taken by</Th>
                      <Th className="w-[110px] text-right">Amount</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {invoice.payments.map((payment) => (
                      <Tr key={payment.id}>
                        <Td className="text-muted-foreground tabular-nums">
                          {formatDateTime(payment.createdAt)}
                        </Td>
                        <Td>{METHOD_LABELS[payment.method] ?? payment.method}</Td>
                        <Td className="text-muted-foreground">
                          {payment.reference || "—"}
                        </Td>
                        <Td className="text-muted-foreground">
                          {payment.takenBy?.name ?? "—"}
                        </Td>
                        <Td className="text-right font-medium tabular-nums">
                          {formatCents(payment.amountCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">
                  {invoice.notes}
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
              <SummaryRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
              <SummaryRow
                label={`Tax (${formatBps(invoice.taxRateBps)})`}
                value={formatCents(totals.taxCents)}
              />
              <div className="my-1 h-px bg-border" />
              <SummaryRow
                label="Total"
                value={formatCents(totals.totalCents)}
                strong
              />
              <SummaryRow
                label="Paid"
                value={`-${formatCents(totals.paidCents)}`}
              />
              <div className="my-1 h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-foreground">Balance due</span>
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    isVoid
                      ? "text-faint-foreground line-through"
                      : totals.balanceCents > 0
                        ? "text-foreground"
                        : "text-status-resolved",
                  )}
                >
                  {formatCents(Math.max(totals.balanceCents, 0))}
                </span>
              </div>
              {invoice.customer.creditBalanceCents > 0 ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  {customerName} holds{" "}
                  {formatCents(invoice.customer.creditBalanceCents)} in store credit.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-[13px]">
              <MetaRow label="Customer">
                <Link
                  href={`/customers/${invoice.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {customerName}
                </Link>
              </MetaRow>
              {invoice.customer.email ? (
                <MetaRow label="Email">
                  <span className="text-muted-foreground">
                    {invoice.customer.email}
                  </span>
                </MetaRow>
              ) : null}
              <MetaRow label="Invoice date">
                <span className="tabular-nums text-muted-foreground">
                  {formatDate(invoice.createdAt)}
                </span>
              </MetaRow>
              <MetaRow label="Due date">
                <span
                  className={cn(
                    "tabular-nums",
                    overdue ? "font-medium text-status-overdue" : "text-muted-foreground",
                  )}
                >
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                </span>
              </MetaRow>
              {invoice.paidAt ? (
                <MetaRow label="Paid on">
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(invoice.paidAt)}
                  </span>
                </MetaRow>
              ) : null}
              {invoice.ticket ? (
                <MetaRow label="Ticket">
                  <Link
                    href={`/tickets/${invoice.ticket.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <Wrench className="size-3.5" />#{invoice.ticket.number}
                  </Link>
                </MetaRow>
              ) : null}
            </CardContent>
          </Card>

          {invoice.signatureDataUrl ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer signature</CardTitle>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={invoice.signatureDataUrl}
                  alt={`Signature of ${customerName}`}
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

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-medium text-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
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
