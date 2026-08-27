import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
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

/** Chips that link somewhere get a gentle accent tint on hover. */
const LINK_CHIP =
  "transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground";

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
    <div className="flex flex-col gap-5">
      <Link
        href="/estimates"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All estimates
      </Link>

      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">
                  Estimate #{estimate.number}
                </span>
                <EstimateStatusBadge status={estimate.status} />
              </div>
              <Link
                href={`/customers/${estimate.customer.id}`}
                className="w-fit text-lg font-semibold text-foreground transition-colors hover:text-accent"
              >
                {customerName}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
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
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Chip icon={CalendarDays}>Quoted {formatDate(estimate.createdAt)}</Chip>

            <Chip
              icon={CalendarClock}
              className={cn(expired && "bg-status-overdue-bg text-status-overdue-fg")}
            >
              {estimate.expiresAt
                ? expired
                  ? `Expired ${formatDate(estimate.expiresAt)}`
                  : `Expires ${formatDate(estimate.expiresAt)}`
                : "No expiry"}
            </Chip>

            {estimate.approvedAt ? (
              <Chip
                icon={CheckCircle2}
                className="bg-status-resolved-bg text-status-resolved-fg"
              >
                Approved {formatDate(estimate.approvedAt)}
              </Chip>
            ) : null}

            {estimate.ticket ? (
              <Link href={`/tickets/${estimate.ticket.id}`}>
                <Chip icon={Wrench} className={LINK_CHIP}>
                  Ticket #{estimate.ticket.number}
                </Chip>
              </Link>
            ) : null}

            {estimate.invoices.map((invoice) => (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                <Chip icon={Receipt} className={LINK_CHIP}>
                  Invoice #{invoice.number}
                </Chip>
              </Link>
            ))}
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
                    <Th className="w-[70px] text-right">Qty</Th>
                    <Th className="w-[120px] text-right">Rate</Th>
                    <Th className="w-[70px] text-center">Tax</Th>
                    <Th className="w-[130px] text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {estimate.lines.map((line) => (
                    <Tr key={line.id}>
                      <Td className="whitespace-normal py-4 font-medium text-foreground">
                        {line.description}
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
                  {estimate.lines.length === 0 ? (
                    <Tr className="hover:bg-transparent">
                      <Td
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No line items on this estimate yet.
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
                  label={`Tax (${formatBps(estimate.taxRateBps)})`}
                  value={formatCents(totals.taxCents)}
                />
                <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Estimated total
                  </span>
                  <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                    {formatCents(totals.totalCents)}
                  </span>
                </div>
              </div>
            </CardFooter>
          </Card>

          {estimate.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <Fact label="Customer">
                <Link
                  href={`/customers/${estimate.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {customerName}
                </Link>
              </Fact>
              <Fact label="Email">
                {estimate.customer.email ? (
                  <a
                    href={`mailto:${estimate.customer.email}`}
                    className="text-accent hover:underline"
                  >
                    {estimate.customer.email}
                  </a>
                ) : (
                  <span className="text-faint-foreground">None on file</span>
                )}
              </Fact>
              <Fact label="Quoted">
                <span className="tabular-nums">{formatDate(estimate.createdAt)}</span>
              </Fact>
              <Fact label="Expires">
                <span
                  className={cn("tabular-nums", expired && "text-status-overdue-fg")}
                >
                  {estimate.expiresAt ? formatDate(estimate.expiresAt) : "No expiry"}
                </span>
              </Fact>
              {estimate.approvedAt ? (
                <Fact label="Approved">
                  <span className="tabular-nums">
                    {formatDate(estimate.approvedAt)}
                  </span>
                </Fact>
              ) : null}
              {estimate.ticket ? (
                <Fact label="Ticket">
                  <Link
                    href={`/tickets/${estimate.ticket.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <Wrench className="size-4" />#{estimate.ticket.number}
                  </Link>
                </Fact>
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
