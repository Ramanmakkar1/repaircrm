import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { estimateTokenPath, portalUrl } from "@/lib/comms";
import {
  defaultEstimateMessage,
  defaultEstimateSubject,
} from "@/lib/comms/documents";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { taxLabel } from "@/lib/tax";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { CopyableId } from "@/components/ui/copyable-id";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ActionForm } from "@/components/billing/action-form";
import { formatDate } from "@/components/billing/format";
import { SendDocumentDialog } from "@/components/billing/send-dialog";
import { ShareRow } from "@/components/billing/send-links";
import { relativeTime, type SendDocument } from "@/components/billing/send-types";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import {
  EstimateStatusBadge,
  InvoiceStatusBadge,
} from "@/components/billing/status-badge";
import {
  approveEstimateAction,
  approveWithSignatureAction,
  convertEstimateAction,
  declineEstimateAction,
  previewEstimateSendAction,
  sendEstimateAction,
} from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: estimate
      ? `Estimate #${estimate.number} · RepairPilot`
      : "Estimate · RepairPilot",
  };
}

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
      taxRate: { select: { name: true } },
      shop: { select: { name: true } },
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
  const canApprove = ["DRAFT", "SENT", "DECLINED"].includes(estimate.status);
  const canDecline = ["DRAFT", "SENT", "APPROVED"].includes(estimate.status);
  const canConvert =
    ["DRAFT", "SENT", "APPROVED"].includes(estimate.status) &&
    estimate.lines.length > 0;

  const expired =
    estimate.expiresAt !== null &&
    estimate.expiresAt.getTime() < requestNow() &&
    (estimate.status === "DRAFT" || estimate.status === "SENT");

  // ---------------------------------------------------------------- sending
  // CommunicationLog can link to a ticket or an invoice, but the schema has no
  // estimateId column — so "when did we last send this estimate?" is answered
  // by scanning the customer's recent outbound rows for this estimate's number.
  // Matched in JS with a word boundary rather than a SQL `contains`, which
  // would happily count "Estimate #70" as a send of estimate #7.
  const recentSends = await db.communicationLog.findMany({
    where: { shopId, customerId: estimate.customerId, direction: "OUT" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { createdAt: true, type: true, status: true, subject: true, body: true },
  });

  const numberPattern = new RegExp(`Estimate #${estimate.number}\\b`);
  const lastSent = recentSends.find(
    (row) =>
      numberPattern.test(row.subject ?? "") || numberPattern.test(row.body),
  );

  const lastSentChannel = lastSent?.type === "SMS" ? "SMS" : "email";
  const lastSentHint = lastSent
    ? lastSent.status === "sent" || lastSent.status === "logged"
      ? `Last sent ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} by ${lastSentChannel}`
      : `Last ${lastSentChannel} attempt ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} — ${lastSent.status}`
    : null;

  const sendDoc: SendDocument = {
    id: estimate.id,
    kind: "estimate",
    label: `Estimate #${estimate.number}`,
    customerName,
    defaultSubject: defaultEstimateSubject(estimate.number, estimate.shop.name),
    defaultMessage: defaultEstimateMessage(estimate.number, totals.totalCents),
    email: estimate.customer.email,
    emailOptIn: estimate.customer.emailOptIn,
    mobile: estimate.customer.mobile,
    smsOptIn: estimate.customer.smsOptIn,
    alreadySent: estimate.status !== "DRAFT",
    lastSentHint,
  };

  // Same frictionless link the email and the SMS carry — it lands the customer
  // on the approve/decline buttons without a sign-in in the way.
  const viewUrl = portalUrl(estimateTokenPath(estimate.publicToken));

  /*
   * An estimate has exactly one number worth putting at the top: what the job
   * is quoted at. Unlike an invoice there is no balance — nothing is owed
   * until the work is approved and billed — so the total takes the headline
   * slot and the strip underneath carries who, when and until when.
   */
  const headlineHint = converted
    ? "Estimated total — already converted to an invoice"
    : expired
      ? "Estimated total — this quote has expired"
      : "Estimated total";

  return (
    <div className="flex flex-col gap-5">
      <ObjectHeader
        back={{ label: "Estimates", href: "/estimates" }}
        value={formatCents(totals.totalCents)}
        /* Same de-duplication as the invoice: the number is the id, so the
           title slot carries who the quote is for. */
        title={
          <Link
            href={`/customers/${estimate.customer.id}`}
            className="hover:underline"
          >
            {customerName}
          </Link>
        }
        subtitle={headlineHint}
        status={<EstimateStatusBadge status={estimate.status} size="md" />}
        id={
          <CopyableId
            value={`Estimate #${estimate.number}`}
            label="estimate number"
          />
        }
        meta={[
          { label: "Tax", value: formatCents(totals.taxCents) },
          { label: "Quoted", value: formatDate(estimate.createdAt) },
          {
            label: "Expires",
            value: (
              <span className={cn(expired && "text-status-overdue-fg")}>
                {estimate.expiresAt ? formatDate(estimate.expiresAt) : "No expiry"}
              </span>
            ),
          },
          {
            label: "Approved",
            value: estimate.approvedAt ? formatDate(estimate.approvedAt) : "—",
          },
          {
            label: "Ticket",
            value: estimate.ticket ? (
              <Link
                href={`/tickets/${estimate.ticket.id}`}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                #{estimate.ticket.number}
              </Link>
            ) : (
              "—"
            ),
          },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/print/estimates/${estimate.id}`} target="_blank">
                <ACTIONS.print /> Print
              </Link>
            </Button>

            {canEdit ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/estimates/${estimate.id}/edit`}>
                  <ACTIONS.edit /> Edit
                </Link>
              </Button>
            ) : null}

            {canApprove ? (
              <>
                <ActionForm
                  action={approveEstimateAction}
                  fields={{ id: estimate.id }}
                  variant="outline"
                  size="sm"
                  pendingLabel="Approving…"
                >
                  <ACTIONS.approve /> Approve
                </ActionForm>
                <SignatureDialog
                  action={approveWithSignatureAction}
                  documentId={estimate.id}
                  title="Approve with signature"
                  description={`Have ${customerName} sign to authorise the work on estimate #${estimate.number}.`}
                  triggerLabel="Approve + sign"
                  triggerSize="sm"
                />
              </>
            ) : null}

            {canDecline ? (
              <ActionForm
                action={declineEstimateAction}
                fields={{ id: estimate.id }}
                variant="outline"
                size="sm"
                pendingLabel="Saving…"
              >
                <ACTIONS.decline /> Decline
              </ActionForm>
            ) : null}

            {canConvert ? (
              <ActionForm
                action={convertEstimateAction}
                fields={{ id: estimate.id }}
                variant="outline"
                size="sm"
                pendingLabel="Converting…"
              >
                <ACTIONS.convert /> Convert to invoice
              </ActionForm>
            ) : null}

            {/* A converted estimate is frozen — the invoice is the record of
                what was agreed, so re-sending the quote would confuse the
                customer about which document is live. */}
            {!converted ? (
              <SendDocumentDialog
                doc={sendDoc}
                previewAction={previewEstimateSendAction}
                sendAction={sendEstimateAction}
                size="sm"
              />
            ) : null}
          </>
        }
      />

      {/* -------------------------------------------------------------- body */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* ------------------------------------------------------ line items */}
          <Card>
            <CardHeader icon={ICONS.checklist} title="Line items" />

            <CardContent className="px-0 py-0">
              {estimate.lines.length === 0 ? (
                // A quote with nothing on it is unfinished, not empty — so the
                // way out is the edit screen, not a shrug in the table body.
                <EmptyState
                  icon={ICONS.estimate}
                  title="Nothing quoted yet"
                  hint="Add the parts and labour this job needs and the customer gets a number to approve."
                  action={
                    canEdit ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/estimates/${estimate.id}/edit`}>
                          <ACTIONS.add /> Add line items
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
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
                        <Td className="whitespace-normal font-medium text-foreground">
                          {line.description}
                        </Td>
                        <Td className="text-right text-muted-foreground">
                          {line.quantity}
                        </Td>
                        <Td className="text-right text-muted-foreground">
                          {formatCents(line.unitPriceCents)}
                        </Td>
                        <Td className="text-center text-[13px] text-muted-foreground">
                          {line.taxable ? "Yes" : "No"}
                        </Td>
                        <Td className="text-right font-semibold text-foreground">
                          {formatCents(line.quantity * line.unitPriceCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>

            {estimate.lines.length > 0 ? (
              <CardFooter className="justify-end bg-surface-hover py-4">
                <div className="flex w-full max-w-[280px] flex-col gap-2 text-[13.5px]">
                  <TotalsRow
                    label="Subtotal"
                    value={formatCents(totals.subtotalCents)}
                  />
                  <TotalsRow
                    label={taxLabel(estimate.taxRate?.name, estimate.taxRateBps)}
                    value={formatCents(totals.taxCents)}
                  />
                  <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                    <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Estimated total
                    </span>
                    <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>
                </div>
              </CardFooter>
            ) : null}
          </Card>

          {/* --------------------------------------------------------- billed */}
          {/* What this quote turned into. An embedded table rather than a row
              of chips: a quote can be billed more than once (a deposit, then
              the balance), and then the question is which invoice, in what
              state. */}
          {estimate.invoices.length > 0 ? (
            <Card>
              <CardHeader icon={ICONS.invoice} title="Invoices raised" />
              <CardContent className="px-0 py-0">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Invoice</Th>
                      <Th className="w-[140px]">Status</Th>
                      <Th className="w-[100px] text-right">Open</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {estimate.invoices.map((invoice) => (
                      <Tr key={invoice.id}>
                        <Td className="font-medium text-foreground">
                          #{invoice.number}
                        </Td>
                        <Td>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-medium text-accent-soft-foreground hover:underline"
                          >
                            View
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {estimate.notes ? (
            <Card>
              <CardHeader icon={ICONS.message} title="Notes" />
              <CardContent>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-5">
          {/* No payment link on an estimate — nothing is owed until the work is
              approved and invoiced. */}
          <Card>
            <CardHeader icon={ACTIONS.copyLink} title="Customer links" />
            <CardContent>
              <ShareRow viewUrl={viewUrl} viewLabel="Copy approval link" />
            </CardContent>
          </Card>

          {/*
            Customer, quoted, expires, approved and the ticket are columns in
            the header's metadata strip now — one place per fact. What is left
            here is what the strip has no room for.
          */}
          <Card>
            <CardHeader icon={ICONS.estimate} title="Details" />
            <CardContent className="flex flex-col gap-3 text-[13.5px]">
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
              <Fact label="Tax rate">
                {taxLabel(estimate.taxRate?.name, estimate.taxRateBps)}
              </Fact>
              {estimate.ticket?.subject ? (
                <Fact label="Repair">{estimate.ticket.subject}</Fact>
              ) : null}
            </CardContent>
          </Card>

          {estimate.approvalSignatureDataUrl ? (
            <Card>
              <CardHeader icon={ICONS.signature} title="Approval signature" />
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
      <span className="rf-num font-semibold text-foreground">{value}</span>
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
      <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint-foreground">
        {label}
      </span>
      <span className="truncate text-[13.5px] text-foreground">{children}</span>
    </div>
  );
}
