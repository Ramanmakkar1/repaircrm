import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileText,
  Hash,
  Pencil,
  Printer,
  Send,
  User,
  Wallet,
  Wrench,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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

/** Chips that link somewhere get a gentle accent tint on hover. */
const LINK_CHIP =
  "transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground";

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
  const settled = !isVoid && totals.balanceCents <= 0;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/invoices"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All invoices
      </Link>

      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">
                  Invoice #{invoice.number}
                </span>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <Link
                href={`/customers/${invoice.customer.id}`}
                className="w-fit text-lg font-semibold text-foreground transition-colors hover:text-accent"
              >
                {customerName}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
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
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Chip icon={CalendarDays}>Raised {formatDate(invoice.createdAt)}</Chip>

            <Chip
              icon={CalendarClock}
              className={cn(
                overdue && "bg-status-overdue-bg text-status-overdue-fg",
              )}
            >
              {invoice.dueDate
                ? overdue
                  ? `Overdue since ${formatDate(invoice.dueDate)}`
                  : `Due ${formatDate(invoice.dueDate)}`
                : "Due on receipt"}
            </Chip>

            {invoice.paidAt ? (
              <Chip
                icon={CheckCircle2}
                className="bg-status-resolved-bg text-status-resolved-fg"
              >
                Paid {formatDate(invoice.paidAt)}
              </Chip>
            ) : null}

            {invoice.ticket ? (
              <Link href={`/tickets/${invoice.ticket.id}`}>
                <Chip icon={Wrench} className={LINK_CHIP}>
                  Ticket #{invoice.ticket.number}
                </Chip>
              </Link>
            ) : null}

            {invoice.estimate ? (
              <Link href={`/estimates/${invoice.estimate.id}`}>
                <Chip icon={FileText} className={LINK_CHIP}>
                  From estimate #{invoice.estimate.number}
                </Chip>
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- body */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* ------------------------------------------------------ line items */}
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>

            <CardContent className="px-0 py-0">
              <Table>
                <THead>
                  <Tr>
                    <Th>Description</Th>
                    <Th className="w-[140px]">Serial</Th>
                    <Th className="w-[70px] text-right">Qty</Th>
                    <Th className="w-[110px] text-right">Rate</Th>
                    <Th className="w-[70px] text-center">Tax</Th>
                    <Th className="w-[120px] text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {invoice.lines.map((line) => (
                    <Tr key={line.id}>
                      <Td className="whitespace-normal py-4 font-medium text-foreground">
                        {line.description}
                      </Td>
                      <Td className="py-4 font-mono text-[13.5px] text-muted-foreground">
                        {line.serial || "—"}
                      </Td>
                      <Td className="py-4 text-right tabular-nums text-muted-foreground">
                        {line.quantity}
                      </Td>
                      <Td className="py-4 text-right tabular-nums text-muted-foreground">
                        {formatCents(line.unitPriceCents)}
                      </Td>
                      <Td className="py-4 text-center text-[13.5px] text-muted-foreground">
                        {line.taxable ? "Yes" : "No"}
                      </Td>
                      <Td className="py-4 text-right font-semibold tabular-nums text-foreground">
                        {formatCents(line.quantity * line.unitPriceCents)}
                      </Td>
                    </Tr>
                  ))}
                  {invoice.lines.length === 0 ? (
                    <Tr className="hover:bg-transparent">
                      <Td
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No line items on this invoice yet.
                      </Td>
                    </Tr>
                  ) : null}
                </TBody>
              </Table>
            </CardContent>

            <CardFooter className="justify-end bg-surface-hover py-5">
              <div className="flex w-full max-w-[300px] flex-col gap-2.5 text-sm">
                <TotalsRow
                  label="Subtotal"
                  value={formatCents(totals.subtotalCents)}
                />
                <TotalsRow
                  label={`Tax (${formatBps(invoice.taxRateBps)})`}
                  value={formatCents(totals.taxCents)}
                />
                <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </span>
                  <span
                    className={cn(
                      "text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground",
                      isVoid && "text-faint-foreground line-through",
                    )}
                  >
                    {formatCents(totals.totalCents)}
                  </span>
                </div>
              </div>
            </CardFooter>
          </Card>

          {/* -------------------------------------------------------- payments */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Payments</CardTitle>
              {hasPayments ? (
                <Chip icon={Wallet}>
                  {formatCents(totals.paidCents)} collected
                </Chip>
              ) : null}
            </CardHeader>

            <CardContent className="px-0 py-0">
              {invoice.payments.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Nothing collected yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {invoice.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex min-w-0 flex-col gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {METHOD_LABELS[payment.method] ?? payment.method}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip icon={CalendarDays}>
                            {formatDateTime(payment.createdAt)}
                          </Chip>
                          {payment.reference ? (
                            <Chip icon={Hash}>{payment.reference}</Chip>
                          ) : null}
                          {payment.takenBy?.name ? (
                            <Chip icon={User}>{payment.takenBy.name}</Chip>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 text-lg font-bold tabular-nums text-status-resolved-fg">
                        {formatCents(payment.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {invoice.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Balance</CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 text-sm">
              <TotalsRow label="Invoice total" value={formatCents(totals.totalCents)} />
              <TotalsRow
                label="Paid to date"
                value={`−${formatCents(totals.paidCents)}`}
              />
            </CardContent>

            <CardFooter className="flex-col items-stretch gap-1.5 bg-surface-hover py-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {settled ? "Status" : "Balance due"}
              </span>
              {isVoid ? (
                <span className="text-3xl font-bold leading-none tabular-nums tracking-tight text-faint-foreground line-through">
                  {formatCents(Math.max(totals.balanceCents, 0))}
                </span>
              ) : settled ? (
                <span className="flex items-center gap-2 text-[26px] font-bold leading-none tracking-tight text-status-resolved-fg">
                  <CheckCircle2 className="size-6 shrink-0" />
                  Paid in full
                </span>
              ) : (
                <span className="text-3xl font-bold leading-none tabular-nums tracking-tight text-status-overdue-fg">
                  {formatCents(totals.balanceCents)}
                </span>
              )}
              {invoice.customer.creditBalanceCents > 0 ? (
                <p className="pt-1 text-[13.5px] text-muted-foreground">
                  {customerName} holds{" "}
                  {formatCents(invoice.customer.creditBalanceCents)} in store credit.
                </p>
              ) : null}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <Fact label="Customer">
                <Link
                  href={`/customers/${invoice.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {customerName}
                </Link>
              </Fact>
              <Fact label="Email">
                {invoice.customer.email ? (
                  <a
                    href={`mailto:${invoice.customer.email}`}
                    className="text-accent hover:underline"
                  >
                    {invoice.customer.email}
                  </a>
                ) : (
                  <span className="text-faint-foreground">None on file</span>
                )}
              </Fact>
              <Fact label="Invoice date">
                <span className="tabular-nums">{formatDate(invoice.createdAt)}</span>
              </Fact>
              <Fact label="Due date">
                <span
                  className={cn(
                    "tabular-nums",
                    overdue && "text-status-overdue-fg",
                  )}
                >
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                </span>
              </Fact>
              {invoice.paidAt ? (
                <Fact label="Paid on">
                  <span className="tabular-nums">{formatDate(invoice.paidAt)}</span>
                </Fact>
              ) : null}
              {invoice.ticket ? (
                <Fact label="Ticket">
                  <Link
                    href={`/tickets/${invoice.ticket.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <Wrench className="size-4" />#{invoice.ticket.number}
                  </Link>
                </Fact>
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
                  className="h-24 w-full rounded-md border border-border bg-white object-contain p-2"
                />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[14.5px] font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}
