import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Hash,
  Pencil,
  Printer,
  Undo2,
  User,
  Wallet,
  Wrench,
} from "lucide-react";

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
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ConfirmActionDialog } from "@/components/billing/action-form";
import { formatDate, formatDateTime, isOverdue } from "@/components/billing/format";
import { ChargeCardButton } from "@/components/billing/charge-card-button";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
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

              {receiptable ? (
                <EmailReceiptButton
                  invoiceId={invoice.id}
                  action={emailInvoiceReceiptAction}
                  blockedReason={emailBlockedReason}
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

              {canRefund ? (
                <RefundDialog
                  action={refundInvoiceAction}
                  invoiceId={invoice.id}
                  refundableCents={totals.refundableCents}
                  payments={refundablePayments}
                  customerName={customerName}
                  defaultMethod={paidWithCredit ? "CREDIT" : "CARD"}
                />
              ) : null}

              {canChargeCard && savedCard ? (
                <ChargeCardButton
                  invoiceId={invoice.id}
                  balanceCents={totals.balanceCents}
                  cardLabel={`${savedCard.brand} ····${savedCard.last4}`}
                  customerName={customerName}
                  action={chargeCardOnFileAction}
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
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {onlinePayments ? (
              <Chip
                icon={CreditCard}
                className="bg-chip-accent-bg text-chip-accent-fg"
              >
                Online payments live
              </Chip>
            ) : null}

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

          {/* Links staff hand over by hand — read down the phone, pasted into
              a chat, or sent from their own address. A void invoice has
              nothing worth sharing. */}
          {!isVoid ? (
            <div className="border-t border-border pt-4">
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
            </div>
          ) : null}
        </CardContent>
      </Card>

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
                  label={taxLabel(invoice.taxRate?.name, invoice.taxRateBps)}
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
                          {paymentLabel(
                            payment.method,
                            payment.reference,
                            payment.stripeSource
                          )}
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

          {/* --------------------------------------------------------- refunds */}
          {/* Rendered only once something has been refunded: a permanently
              empty "Refunds" card on every invoice would be noise, and the
              Refund button in the header is already the affordance. */}
          {hasRefunds ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Refunds</CardTitle>
                <Chip
                  icon={Undo2}
                  className="bg-destructive-soft text-destructive"
                >
                  {formatCents(totals.refundedCents)} returned
                </Chip>
              </CardHeader>

              <CardContent className="px-0 py-0">
                <ul className="divide-y divide-border">
                  {invoice.refunds.map((refund) => (
                    <li
                      key={refund.id}
                      className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex min-w-0 flex-col gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {METHOD_LABELS[refund.method] ?? refund.method}
                          {refund.payment
                            ? ` · against ${paymentLabel(
                                refund.payment.method,
                                refund.payment.reference,
                                refund.payment.stripeSource
                              )}`
                            : ""}
                        </span>
                        {refund.reason ? (
                          <span className="text-[13.5px] leading-snug text-muted-foreground">
                            {refund.reason}
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip icon={CalendarDays}>
                            {formatDateTime(refund.createdAt)}
                          </Chip>
                          {refund.refundedBy?.name ? (
                            <Chip icon={User}>{refund.refundedBy.name}</Chip>
                          ) : null}
                          {/* A Stripe refund is not money back until Stripe
                              says so. "Completed" is the silent default; the
                              two that need chasing say so. */}
                          {refund.status === "pending" ? (
                            <Chip
                              icon={CalendarClock}
                              className="bg-status-waiting-bg text-status-waiting-fg"
                            >
                              Waiting on Stripe
                            </Chip>
                          ) : null}
                          {refund.status === "failed" ? (
                            <Chip
                              icon={Ban}
                              className="bg-destructive-soft text-destructive"
                            >
                              Failed — nothing was returned
                            </Chip>
                          ) : null}
                        </div>
                      </div>
                      {/* Negative-styled: money leaving reads red and signed,
                          so a refund can never be mistaken for a collection. */}
                      <span
                        className={cn(
                          "shrink-0 text-lg font-bold tabular-nums text-destructive",
                          refund.status === "failed" && "line-through opacity-60",
                        )}
                      >
                        −{formatCents(refund.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

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
                  <div className="border-t border-border pt-3">
                    <TotalsRow
                      label="Net paid"
                      value={formatCents(totals.netPaidCents)}
                    />
                  </div>
                </>
              ) : null}
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
          "font-semibold tabular-nums",
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
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[14.5px] font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}
