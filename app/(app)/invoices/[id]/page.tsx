import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { invoiceTokenPath, portalUrl } from "@/lib/comms";
import {
  defaultInvoiceMessage,
  defaultInvoiceSubject,
} from "@/lib/comms/documents";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatHm, labourAmountCents, readLabourSettings, roundSecondsUp } from "@/lib/labour";
import { taxLabel } from "@/lib/tax";
import {
  cardOnFile,
  isStripeReference,
  paymentsLive,
  readTerminalLocationId,
  stripeTestMode,
} from "@/lib/payments";
import { refundAwareTotals } from "@/components/billing/refund-math";
import {
  RefundDialog,
  type RefundablePayment,
} from "@/components/billing/refund-dialog";
import { SendDocumentDialog } from "@/components/billing/send-dialog";
import { UnbilledTimeBanner } from "@/components/billing/unbilled-time-banner";
import { ShareRow } from "@/components/billing/send-links";
import { EmailReceiptButton } from "@/components/billing/send-receipt";
import {
  channelBlockedReason,
  relativeTime,
  type SendDocument,
} from "@/components/billing/send-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyableId } from "@/components/ui/copyable-id";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ConfirmActionDialog } from "@/components/billing/action-form";
import { formatDate, formatDateTime, isOverdue } from "@/components/billing/format";
import { ChargeCardButton } from "@/components/billing/charge-card-button";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import {
  InvoiceStatusBadge,
  RefundStatusBadge,
} from "@/components/billing/status-badge";
import {
  chargeCardOnFileAction,
  emailInvoiceReceiptAction,
  invoicePaymentLinkAction,
  previewInvoiceSendAction,
  recordTerminalPaymentAction,
  refundInvoiceAction,
  saveInvoiceSignatureAction,
  sendInvoiceAction,
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

/**
 * A card payment taken at the counter and one the customer made themselves at
 * 11pm are both `CARD`, and staff need to tell them apart when a customer
 * phones about a charge. The Stripe session id in `reference` is the tell.
 */
function paymentLabel(
  method: string,
  reference: string | null,
  source?: string | null,
): string {
  // Wave 8 stamps the journey onto the row; older rows are recognised by their
  // `cs_…` reference alone.
  if (source === "terminal") return "Card (reader)";
  if (source === "card_on_file") return "Card on file";
  if (source === "checkout" || isStripeReference(reference)) return "Card (online)";
  return METHOD_LABELS[method] ?? method;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: invoice
      ? `Invoice #${invoice.number} · RepairFlow`
      : "Invoice · RepairFlow",
  };
}

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
      shop: { select: { name: true, settings: true } },
      taxRate: { select: { name: true } },
      ticket: { select: { id: true, number: true, subject: true } },
      estimate: { select: { id: true, number: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { takenBy: { select: { name: true } } },
      },
      refunds: {
        orderBy: { createdAt: "asc" },
        include: {
          refundedBy: { select: { name: true } },
          payment: {
            select: { method: true, reference: true, stripeSource: true },
          },
        },
      },
    },
  });
  if (!invoice) notFound();

  // REFUND-AWARE TOTALS. `invoiceTotals()` in lib/money knows nothing about
  // refunds and is shared with estimates/portal/print/API, so the billing
  // module wraps it — see components/billing/refund-math.ts for the math and
  // why it lives there. Everything below (balance due, "can we still take a
  // payment", the settled badge) reads the refund-aware numbers.
  const totals = refundAwareTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
    invoice.refunds
  );
  const customerName =
    invoice.customer.businessName ||
    `${invoice.customer.firstName} ${invoice.customer.lastName}`;

  const isVoid = invoice.status === "VOID";
  const canEdit = invoice.status === "DRAFT" || invoice.status === "SENT";
  const canTakePayment = !isVoid && totals.balanceCents > 0;
  const hasPayments = invoice.payments.length > 0;
  const hasRefunds = invoice.refunds.length > 0;
  const overdue = isOverdue(invoice.dueDate, totals.balanceCents);
  const settled = !isVoid && totals.balanceCents <= 0;

  // Refunding is a till operation, not a bench one — same guard as store-credit
  // adjustments. There is nothing to refund until money has actually come in,
  // and nothing left once it has all gone back out.
  const canRefund =
    (role === "OWNER" || role === "FRONT_DESK") &&
    hasPayments &&
    totals.refundableCents > 0;

  const refundablePayments: RefundablePayment[] = invoice.payments.map(
    (payment) => ({
      id: payment.id,
      label: `${paymentLabel(
        payment.method,
        payment.reference,
        payment.stripeSource
      )} · ${formatCents(payment.amountCents)} · ${formatDate(payment.createdAt)}`,
      amountCents: payment.amountCents,
      isStripe:
        isStripeReference(payment.reference) || Boolean(payment.stripeSource),
      // Only a payment whose PaymentIntent we hold can be reversed from here.
      canRefundToCard:
        payment.method === "CARD" && Boolean(payment.stripePaymentIntentId),
    })
  );

  // A customer who paid with store credit almost always wants it back the same
  // way, so the dialog opens on CREDIT for them rather than on CARD.
  const paidWithCredit = invoice.payments.some((p) => p.method === "CREDIT");
  // Shown only when it is true. "Online payments: off" on every invoice of
  // every shop that never enabled Stripe is an advert, not a status.
  const onlinePayments = paymentsLive() && canTakePayment;

  // The saved card, and whether a reader is paired. Both drive buttons that
  // move money, so both are decided here on the server.
  const savedCard = cardOnFile(invoice.customer);
  const canChargeCard =
    paymentsLive() &&
    canTakePayment &&
    savedCard !== null &&
    (role === "OWNER" || role === "FRONT_DESK");
  const readerPaired =
    paymentsLive() && Boolean(readTerminalLocationId(invoice.shop.settings));

  // ---------------------------------------------------------------- sending
  // The most recent thing that left the building for THIS invoice, whichever
  // channel it went out on. Rendered under the Send button so a second click
  // is an informed one: "we already emailed this an hour ago" is the fact that
  // stops a customer being messaged three times about the same bill.
  // Time logged on the linked ticket that nobody has billed yet. Loaded only
  // for an invoice that can still take lines — nothing to offer otherwise.
  const canAddTime = invoice.ticketId !== null && canEdit;
  const unbilledEntries = canAddTime
    ? await db.timeEntry.findMany({
        where: {
          shopId,
          ticketId: invoice.ticketId!,
          billable: true,
          invoiceId: null,
          endedAt: { not: null },
          seconds: { gt: 0 },
        },
        select: { seconds: true },
      })
    : [];

  const labour = readLabourSettings(invoice.shop.settings);
  const unbilledSeconds = unbilledEntries.reduce(
    (sum, entry) => sum + roundSecondsUp(entry.seconds ?? 0, labour.roundingMinutes),
    0,
  );
  const unbilledCents = unbilledEntries.reduce(
    (sum, entry) => sum + labourAmountCents(entry.seconds ?? 0, labour),
    0,
  );

  const lastSent = await db.communicationLog.findFirst({
    where: { shopId, invoiceId: invoice.id, direction: "OUT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, type: true, status: true },
  });

  const lastSentChannel = lastSent?.type === "SMS" ? "SMS" : "email";
  const lastSentHint = lastSent
    ? lastSent.status === "sent" || lastSent.status === "logged"
      ? `Last sent ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} by ${lastSentChannel}`
      : // A skip or a failure is reported as what it was. "Last sent" over an
        // opted-out row would be a quiet lie staff act on.
        `Last ${lastSentChannel} attempt ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} — ${lastSent.status}`
    : null;

  const sendDoc: SendDocument = {
    id: invoice.id,
    kind: "invoice",
    label: `Invoice #${invoice.number}`,
    customerName,
    defaultSubject: defaultInvoiceSubject(invoice.number, invoice.shop.name),
    defaultMessage: defaultInvoiceMessage(invoice.number, totals.totalCents),
    email: invoice.customer.email,
    emailOptIn: invoice.customer.emailOptIn,
    mobile: invoice.customer.mobile,
    smsOptIn: invoice.customer.smsOptIn,
    alreadySent: invoice.status !== "DRAFT",
    lastSentHint,
  };

  // The frictionless link — the same URL the emails and texts carry.
  const viewUrl = portalUrl(invoiceTokenPath(invoice.publicToken));

  // A checkout session can only be opened against an issued invoice with money
  // still on it. Anywhere else the button is absent rather than dead.
  const canCopyPaymentLink =
    paymentsLive() &&
    totals.balanceCents > 0 &&
    (invoice.status === "SENT" || invoice.status === "PARTIAL");

  const emailBlockedReason = channelBlockedReason("EMAIL", sendDoc);
  const receiptable = settled && hasPayments;

  /*
   * THE HEADLINE FIGURE IS THE BALANCE, NOT THE TOTAL.
   *
   * Whoever opens an invoice is nearly always answering one question — "how
   * much do they still owe?" — and the total is the wrong answer to it the
   * moment a single payment has landed. The total keeps its place in the
   * metadata strip, and the whole ledger (total, paid, refunded, net) is a
   * click of the eye away in the Balance card.
   *
   * Clamped at zero for the same reason the voided card always was: a
   * negative headline reads as a bill, and an overpayment is a credit. The
   * Balance card still shows the unclamped arithmetic.
   */
  const headlineBalance = formatCents(Math.max(totals.balanceCents, 0));
  const headlineTone = isVoid
    ? "text-faint-foreground line-through"
    : settled
      ? "text-status-resolved-fg"
      : overdue
        ? "text-status-overdue-fg"
        : "text-foreground";
  const headlineHint = isVoid
    ? "Voided — nothing is owed on this invoice"
    : settled
      ? "Balance due — paid in full"
      : overdue
        ? "Balance due — overdue"
        : "Balance due";

  return (
    <div className="flex flex-col gap-5">
      <ObjectHeader
        back={{ label: "Invoices", href: "/invoices" }}
        value={<span className={headlineTone}>{headlineBalance}</span>}
        /*
          The title said "Invoice #1014" and the copyable id said "Invoice
          #1014" directly under it. Two lines, one fact. The document number is
          the id — that is what it is for — so the title slot goes to the thing
          the number does not tell you: who owes this. It links, so the
          Customer column the strip used to carry is redundant and gone.
        */
        title={
          <Link
            href={`/customers/${invoice.customer.id}`}
            className="hover:underline"
          >
            {customerName}
          </Link>
        }
        subtitle={headlineHint}
        status={<InvoiceStatusBadge status={invoice.status} size="md" />}
        id={
          <CopyableId
            value={`Invoice #${invoice.number}`}
            label="invoice number"
          />
        }
        meta={[
          {
            label: "Invoice total",
            value: (
              <span className={cn(isVoid && "text-faint-foreground line-through")}>
                {formatCents(totals.totalCents)}
              </span>
            ),
          },
          { label: "Collected", value: formatCents(totals.paidCents) },
          { label: "Issued", value: formatDate(invoice.createdAt) },
          {
            label: "Due",
            value: (
              <span className={cn(overdue && "text-status-overdue-fg")}>
                {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
              </span>
            ),
          },
          {
            label: "Ticket",
            value: invoice.ticket ? (
              <Link
                href={`/tickets/${invoice.ticket.id}`}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                #{invoice.ticket.number}
              </Link>
            ) : (
              "—"
            ),
          },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/print/invoices/${invoice.id}`} target="_blank">
                <ACTIONS.print /> Print
              </Link>
            </Button>

            {canEdit ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <ACTIONS.edit /> Edit
                </Link>
              </Button>
            ) : null}

            {receiptable ? (
              <EmailReceiptButton
                invoiceId={invoice.id}
                action={emailInvoiceReceiptAction}
                blockedReason={emailBlockedReason}
                size="sm"
              />
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
                triggerSize="sm"
              />
            ) : null}

            {role === "OWNER" && !isVoid ? (
              <ConfirmActionDialog
                action={voidInvoiceAction}
                fields={{ id: invoice.id }}
                triggerLabel="Void"
                triggerIcon={<ACTIONS.void />}
                triggerSize="sm"
                title={`Void invoice #${invoice.number}?`}
                description="The invoice stays on record but stops counting as money owed. This cannot be undone."
                confirmLabel="Void invoice"
                disabled={hasPayments}
                disabledReason="This invoice has payments recorded against it — refund and remove them first."
              />
            ) : null}

            {canRefund ? (
              <RefundDialog
                action={refundInvoiceAction}
                invoiceId={invoice.id}
                refundableCents={totals.refundableCents}
                payments={refundablePayments}
                customerName={customerName}
                defaultMethod={paidWithCredit ? "CREDIT" : "CARD"}
                size="sm"
              />
            ) : null}

            {canChargeCard && savedCard ? (
              <ChargeCardButton
                invoiceId={invoice.id}
                balanceCents={totals.balanceCents}
                cardLabel={`${savedCard.brand} ····${savedCard.last4}`}
                customerName={customerName}
                action={chargeCardOnFileAction}
                size="sm"
              />
            ) : null}

            {canTakePayment ? (
              <PaymentDialog
                action={takePaymentAction}
                invoiceId={invoice.id}
                balanceCents={totals.balanceCents}
                customerCreditCents={invoice.customer.creditBalanceCents}
                customerName={customerName}
                receiptAction={emailInvoiceReceiptAction}
                size="sm"
                terminal={
                  readerPaired
                    ? {
                        testMode: stripeTestMode(),
                        record: recordTerminalPaymentAction,
                        // The way out when the machine is unplugged: the
                        // same hosted link the Share row hands out.
                        paymentLink: invoicePaymentLinkAction,
                      }
                    : undefined
                }
              />
            ) : null}

            {/* The primary action, last so it sits at the end of the row —
                and the only one that both delivers the document and moves it
                out of DRAFT. */}
            {!isVoid ? (
              <SendDocumentDialog
                doc={sendDoc}
                previewAction={previewInvoiceSendAction}
                sendAction={sendInvoiceAction}
                size="sm"
              />
            ) : null}
          </>
        }
      />

      {/* -------------------------------------------------------------- body */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {unbilledEntries.length > 0 ? (
            <UnbilledTimeBanner
              invoiceId={invoice.id}
              entryCount={unbilledEntries.length}
              durationLabel={formatHm(unbilledSeconds)}
              amountLabel={formatCents(unbilledCents)}
            />
          ) : null}

          {/* ------------------------------------------------------ line items */}
          <Card>
            <CardHeader icon={ICONS.checklist} title="Line items" />

            <CardContent className="px-0 py-0">
              {invoice.lines.length === 0 ? (
                // A bill with nothing on it cannot be sent or paid, so the way
                // out is the edit screen rather than a shrug in the table body.
                <EmptyState
                  icon={ICONS.invoice}
                  title="Nothing billed yet"
                  hint="Add the parts, labour and products this invoice covers before you send it."
                  action={
                    canEdit ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/invoices/${invoice.id}/edit`}>
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
                        <Td className="whitespace-normal font-medium text-foreground">
                          {line.description}
                        </Td>
                        <Td className="rf-id text-[12.5px] text-muted-foreground">
                          {line.serial || "—"}
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

            {invoice.lines.length > 0 ? (
              <CardFooter className="justify-end bg-surface-hover py-4">
                <div className="flex w-full max-w-[280px] flex-col gap-2 text-[13.5px]">
                  <TotalsRow
                    label="Subtotal"
                    value={formatCents(totals.subtotalCents)}
                  />
                  <TotalsRow
                    label={taxLabel(invoice.taxRate?.name, invoice.taxRateBps)}
                    value={formatCents(totals.taxCents)}
                  />
                  <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                    <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Total
                    </span>
                    <span
                      className={cn(
                        "rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground",
                        isVoid && "text-faint-foreground line-through",
                      )}
                    >
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>
                </div>
              </CardFooter>
            ) : null}
          </Card>

          {/* -------------------------------------------------------- payments */}
          <Card>
            <CardHeader
              icon={ICONS.payment}
              title="Payments"
              action={
                hasPayments ? (
                  <Chip icon={ICONS.deposit}>
                    {formatCents(totals.paidCents)} collected
                  </Chip>
                ) : null
              }
            />

            <CardContent className="px-0 py-0">
              {invoice.payments.length === 0 ? (
                <EmptyState
                  icon={ICONS.payment}
                  title="Nothing collected yet"
                  hint={
                    isVoid
                      ? "This invoice was voided before any money came in."
                      : "Every payment taken against this invoice is listed here, with who took it and when."
                  }
                />
              ) : (
                /*
                  An embedded table rather than a stack of rows: payment
                  history is a ledger, and a ledger is read down a column.
                  The reference column is the one that earns the table — a
                  Stripe session or PaymentIntent id gets chased through a
                  refund or a chargeback, so it is copyable rather than
                  merely printed.
                */
                <Table>
                  <THead>
                    <Tr>
                      <Th>Method</Th>
                      <Th className="w-[190px]">Taken</Th>
                      <Th>Reference</Th>
                      <Th className="w-[150px]">By</Th>
                      <Th className="w-[120px] text-right">Amount</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {invoice.payments.map((payment) => (
                      <Tr key={payment.id}>
                        <Td className="font-medium text-foreground">
                          {paymentLabel(
                            payment.method,
                            payment.reference,
                            payment.stripeSource
                          )}
                        </Td>
                        <Td className="text-muted-foreground">
                          {formatDateTime(payment.createdAt)}
                        </Td>
                        <Td className="max-w-[18rem]">
                          <PaymentReference
                            reference={payment.reference}
                            paymentIntentId={payment.stripePaymentIntentId}
                          />
                        </Td>
                        <Td className="text-muted-foreground">
                          {payment.takenBy?.name ?? "—"}
                        </Td>
                        <Td className="text-right font-semibold text-status-resolved-fg">
                          {formatCents(payment.amountCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------------------- refunds */}
          {/* Rendered only once something has been refunded: a permanently
              empty "Refunds" card on every invoice would be noise, and the
              Refund button in the header is already the affordance. */}
          {hasRefunds ? (
            <Card>
              <CardHeader
                icon={ICONS.refund}
                title="Refunds"
                action={
                  <Chip
                    icon={ICONS.refund}
                    className="bg-destructive-soft text-destructive"
                  >
                    {formatCents(totals.refundedCents)} returned
                  </Chip>
                }
              />

              <CardContent className="px-0 py-0">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Refund</Th>
                      <Th className="w-[190px]">Issued</Th>
                      <Th>Reference</Th>
                      <Th className="w-[150px]">By</Th>
                      <Th className="w-[120px] text-right">Amount</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {invoice.refunds.map((refund) => (
                      <Tr key={refund.id}>
                        <Td className="max-w-[22rem] whitespace-normal">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {METHOD_LABELS[refund.method] ?? refund.method}
                                {refund.payment
                                  ? ` · against ${paymentLabel(
                                      refund.payment.method,
                                      refund.payment.reference,
                                      refund.payment.stripeSource
                                    )}`
                                  : ""}
                              </span>
                              {/* A Stripe refund is not money back until Stripe
                                  says so. "Completed" is the silent default; the
                                  two that need chasing wear a pill. */}
                              <RefundStatusBadge status={refund.status} />
                            </div>
                            {refund.reason ? (
                              <span className="text-[13px] leading-snug text-muted-foreground">
                                {refund.reason}
                              </span>
                            ) : null}
                          </div>
                        </Td>
                        <Td className="text-muted-foreground">
                          {formatDateTime(refund.createdAt)}
                        </Td>
                        <Td className="max-w-[16rem]">
                          {refund.stripeRefundId ? (
                            <CopyableId
                              value={refund.stripeRefundId}
                              label="Stripe refund id"
                            />
                          ) : (
                            <span className="text-faint-foreground">—</span>
                          )}
                        </Td>
                        <Td className="text-muted-foreground">
                          {refund.refundedBy?.name ?? "—"}
                        </Td>
                        {/* Negative-styled: money leaving reads red and signed,
                            so a refund can never be mistaken for a collection. */}
                        <Td
                          className={cn(
                            "text-right font-semibold text-destructive",
                            refund.status === "failed" &&
                              "line-through opacity-60",
                          )}
                        >
                          −{formatCents(refund.amountCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {invoice.notes ? (
            <Card>
              <CardHeader icon={ICONS.message} title="Notes" />
              <CardContent>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                  {invoice.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader icon={ICONS.deposit} title="Balance" />

            <CardContent className="flex flex-col gap-2.5 text-[13.5px]">
              <TotalsRow label="Invoice total" value={formatCents(totals.totalCents)} />
              <TotalsRow
                label="Paid to date"
                value={`−${formatCents(totals.paidCents)}`}
              />
              {/* Refunds add BACK to what is owed, so the sign is the opposite
                  of the payment line above. Net kept is spelled out rather than
                  left as mental arithmetic between two signed rows. */}
              {hasRefunds ? (
                <>
                  <TotalsRow
                    label="Refunded"
                    value={`+${formatCents(totals.refundedCents)}`}
                    tone="destructive"
                  />
                  <div className="border-t border-border pt-2.5">
                    <TotalsRow
                      label="Net paid"
                      value={formatCents(totals.netPaidCents)}
                    />
                  </div>
                </>
              ) : null}
            </CardContent>

            <CardFooter className="flex-col items-stretch gap-1 bg-surface-hover py-4">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {settled ? "Status" : "Balance due"}
              </span>
              {isVoid ? (
                <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-faint-foreground line-through">
                  {formatCents(Math.max(totals.balanceCents, 0))}
                </span>
              ) : settled ? (
                <span className="flex items-center gap-2 text-[18px] font-semibold leading-none tracking-[-0.01em] text-status-resolved-fg">
                  <CheckCircle2 className="size-[18px] shrink-0" />
                  Paid in full
                </span>
              ) : (
                <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-status-overdue-fg">
                  {formatCents(totals.balanceCents)}
                </span>
              )}
              {invoice.customer.creditBalanceCents > 0 ? (
                <p className="pt-1 text-[13px] text-muted-foreground">
                  {customerName} holds{" "}
                  {formatCents(invoice.customer.creditBalanceCents)} in store credit.
                </p>
              ) : null}
            </CardFooter>
          </Card>

          {/* Links staff hand over by hand — read down the phone, pasted into
              a chat, or sent from their own address. A void invoice has
              nothing worth sharing. */}
          {!isVoid ? (
            <Card>
              <CardHeader
                icon={ACTIONS.copyLink}
                title="Customer links"
                action={
                  onlinePayments ? (
                    <Chip
                      icon={ICONS.payment}
                      className="bg-chip-accent-bg text-chip-accent-fg"
                    >
                      Online payments live
                    </Chip>
                  ) : null
                }
              />
              <CardContent>
                <ShareRow
                  viewUrl={viewUrl}
                  payment={
                    canCopyPaymentLink
                      ? {
                          invoiceId: invoice.id,
                          action: invoicePaymentLinkAction,
                        }
                      : null
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          {/*
            Customer, total, issued, due and the ticket are columns in the
            header's metadata strip now — one place per fact. What is left
            here is what the strip has no room for.
          */}
          <Card>
            <CardHeader icon={ICONS.invoice} title="Details" />
            <CardContent className="flex flex-col gap-3 text-[13.5px]">
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
              {invoice.paidAt ? (
                <Fact label="Paid on">
                  <span className="rf-num">{formatDate(invoice.paidAt)}</span>
                </Fact>
              ) : null}
              {invoice.ticket?.subject ? (
                <Fact label="Repair">{invoice.ticket.subject}</Fact>
              ) : null}
              {invoice.estimate ? (
                <Fact label="From estimate">
                  <Link
                    href={`/estimates/${invoice.estimate.id}`}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <ICONS.estimate className="size-4" />#
                    {invoice.estimate.number}
                  </Link>
                </Fact>
              ) : null}
            </CardContent>
          </Card>

          {invoice.signatureDataUrl ? (
            <Card>
              <CardHeader icon={ICONS.signature} title="Customer signature" />
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

/**
 * The Stripe handles on a payment row.
 *
 * `reference` is whatever was written down at the till — a `cs_…` checkout
 * session, an auth code, a cheque number. `stripePaymentIntentId` is the id a
 * refund or a chargeback is actually argued with, and the two are different
 * strings, so both are offered rather than one standing in for the other.
 */
function PaymentReference({
  reference,
  paymentIntentId,
}: {
  reference: string | null;
  paymentIntentId: string | null;
}) {
  if (!reference && !paymentIntentId) {
    return <span className="text-faint-foreground">—</span>;
  }
  return (
    <div className="flex flex-col items-start gap-0.5">
      {reference ? (
        <CopyableId value={reference} label="payment reference" />
      ) : null}
      {paymentIntentId && paymentIntentId !== reference ? (
        <CopyableId value={paymentIntentId} label="Stripe payment id" />
      ) : null}
    </div>
  );
}

function TotalsRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "destructive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "rf-num font-semibold",
          tone === "destructive" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
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
