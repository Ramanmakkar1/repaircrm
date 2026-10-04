import { Fragment } from "react";
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
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { formatHm, labourAmountCents, readLabourSettings, roundSecondsUp } from "@/lib/labour";
import { taxLabel } from "@/lib/tax";
import {
  cardExpired,
  cardOnFile,
  isStripeReference,
  paymentsLive,
  readTerminalLocationId,
  stripeTestMode,
} from "@/lib/payments";
import { listSquareDevices, squareConnectionStatus } from "@/lib/payments/square";
import { refundAwareTotals } from "@/components/billing/refund-math";
import {
  balanceBlock,
  docTabs,
  invoiceActivity,
  invoicePrimaryLabel,
  invoiceTiles,
  parseDocTab,
} from "@/components/billing/bill-display";
import { BackLink, BalanceHero, BillSummary, PinnedAction } from "@/components/billing/bill-hero";
import {
  ActivityList,
  EmptyLines,
  FactList,
  LineList,
  MoneyRows,
  Section,
  TotalsBlock,
  type MoneyRowData,
  type TotalRow,
} from "@/components/billing/bill-lines";
import { InvoiceActionMenu } from "@/components/billing/invoice-action-menu";
import { invoicePrimaryAction } from "@/components/billing/primary-action";
import { CopyLinkTile, EmailReceiptTile } from "@/components/billing/quick-tiles";
import { RefundDialog, type RefundablePayment } from "@/components/billing/refund-dialog";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import { BIG_BUTTON_SLOT, TILE_CLASS } from "@/components/billing/tile-style";
import { primaryPhone } from "@/components/customers/customer-facts";
import { SendDocumentDialog } from "@/components/billing/send-dialog";
import { UnbilledTimeBanner } from "@/components/billing/unbilled-time-banner";
import { ShareRow } from "@/components/billing/send-links";
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
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { formatDate, formatDateTime, isOverdue } from "@/components/billing/format";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { readCardMachine, resolveCardFlow } from "@/lib/payments/card-machine";
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
  gateway?: string | null,
): string {
  if (gateway === "square" && source === "terminal") return "Card (Square Terminal)";
  if (gateway === "square") return "Card (Square online)";
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
      ? `Invoice #${invoice.number} · Repairs helper`
      : "Invoice · Repairs helper",
  };
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, prefs, query] = await Promise.all([params, readUiPrefs(), searchParams]);
  // Easy mode (the default): one big action chosen by status, the rest under "More".
  const easy = prefs.simple;

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
  const square = await squareConnectionStatus(shopId);
  const squareDevices = square.connected ? await listSquareDevices(shopId) : [];

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
        payment.stripeSource ?? payment.gatewaySource,
        payment.gateway,
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
  const onlinePayments = (paymentsLive() || square.connected) && canTakePayment;

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

  // The same three controls feed both layouts; only their size and look differ.
  const actionMenu = (large: boolean, tile = false) => (
    <InvoiceActionMenu
      invoiceId={invoice.id}
      invoiceNumber={invoice.number}
      customerName={customerName}
      printHref={`/print/invoices/${invoice.id}`}
      editHref={canEdit ? `/invoices/${invoice.id}/edit` : null}
      receipt={
        receiptable
          ? {
              action: emailInvoiceReceiptAction,
              blockedReason: emailBlockedReason,
            }
          : null
      }
      signature={
        !isVoid
          ? {
              action: saveInvoiceSignatureAction,
              signed: Boolean(invoice.signatureDataUrl),
            }
          : null
      }
      chargeCard={
        canChargeCard && savedCard
          ? {
              action: chargeCardOnFileAction,
              balanceCents: totals.balanceCents,
              cardLabel: `${savedCard.brand} ····${savedCard.last4}`,
            }
          : null
      }
      refund={
        canRefund
          ? {
              action: refundInvoiceAction,
              refundableCents: totals.refundableCents,
              payments: refundablePayments,
              defaultMethod: paidWithCredit ? "CREDIT" : "CARD",
            }
          : null
      }
      voidInvoice={
        role === "OWNER" && !isVoid
          ? {
              action: voidInvoiceAction,
              blockedReason: hasPayments
                ? "This invoice has payments recorded against it — refund and remove them first."
                : null,
            }
          : null
      }
      large={large}
      tile={tile}
    />
  );

  const paymentDialog = (size: "sm" | "lg", appearance: "button" | "tile" = "button") =>
    canTakePayment ? (
      <PaymentDialog
        appearance={appearance}
        action={takePaymentAction}
        invoiceId={invoice.id}
        balanceCents={totals.balanceCents}
        customerCreditCents={invoice.customer.creditBalanceCents}
        customerName={customerName}
        receiptAction={emailInvoiceReceiptAction}
        size={size}
        cardFlow={resolveCardFlow(readCardMachine(invoice.shop.settings), {
          stripe: readerPaired,
          square: squareDevices.length > 0,
        })}
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
        squareTerminal={
          squareDevices.length > 0
            ? {
                devices: squareDevices.map((device) => ({
                  id: device.deviceId ?? device.id,
                  name: device.name,
                  status: device.status,
                })),
              }
            : undefined
        }
      />
    ) : null;

  const sendDialog = (appearance: "default" | "primary" | "secondary") =>
    !isVoid ? (
      <SendDocumentDialog
        doc={sendDoc}
        previewAction={previewInvoiceSendAction}
        sendAction={sendInvoiceAction}
        size="sm"
        appearance={appearance}
      />
    ) : null;

  const fullHeader = (
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
      /*
        TWO BUTTONS AND A `⋯`, NOT EIGHT BUTTONS.

        This header could offer nine controls at once — print, edit, email a
        receipt, collect a signature, charge the card on file, refund, void,
        take a payment, send — and which of them exist depends on the
        invoice's state, so the row was a different length and a different
        shape on every invoice and wrapped onto a second line at 1280px.

        What is left inline is what someone opened the invoice to do: take
        the money, and send the bill. Everything else is in the menu, in an
        order that does not move. Nothing was removed and no action behaves
        differently — see components/billing/invoice-action-menu.tsx for how
        the dialogs are driven from menu items.
      */
      actions={
        <>
          {actionMenu(false)}
          {paymentDialog("sm")}

          {/* The primary action, last so it sits at the end of the row —
              and the only one that both delivers the document and moves it
              out of DRAFT. */}
          {sendDialog("default")}
        </>
      }
    />
  );

  // ============================================================== Easy: the bill
  // A POS-style receipt. The left column is the bill itself behind four big
  // tabs (Bill, Customer, Activity, Share, in the URL as ?tab=); the right
  // column is the till: who, the amount due in very large type, the one big
  // button for this state and a few quick tiles. Every figure and every action
  // below is the one the Full layout uses; only the arrangement is new.
  if (easy) {
    const now = requestNow();
    const tab = parseDocTab(query.tab);
    const basePath = `/invoices/${invoice.id}`;
    const printHref = `/print/invoices/${invoice.id}`;

    const primary = invoicePrimaryAction({
      status: invoice.status,
      voided: isVoid,
      canTakePayment,
    });
    const alreadySent = invoice.status !== "DRAFT";
    const primaryLabel = invoicePrimaryLabel(primary, { alreadySent, receiptable });
    // The hint sits under the tiles, once, instead of inside each send button.
    const quietDoc: SendDocument = { ...sendDoc, lastSentHint: null };
    const phone = primaryPhone(invoice.customer).value || null;

    const block = balanceBlock(
      {
        status: invoice.status,
        totalCents: totals.totalCents,
        paidCents: totals.paidCents,
        refundedCents: totals.refundedCents,
        balanceCents: totals.balanceCents,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
      },
      now,
    );

    /** The one big button. Built per call so the phone's pinned copy is its own. */
    const bigAction = (): React.ReactNode => {
      if (primary === "pay") return <div className={BIG_BUTTON_SLOT}>{paymentDialog("lg")}</div>;
      if (primary === "send") {
        return (
          <SendDocumentDialog
            doc={quietDoc}
            previewAction={previewInvoiceSendAction}
            sendAction={sendInvoiceAction}
            size="lg"
            appearance="big"
          />
        );
      }
      if (primary === "print") {
        return (
          <Button asChild className="h-14 w-full px-6 text-lg [&_svg]:size-5">
            <Link href={printHref} target="_blank">
              <ACTIONS.print /> {primaryLabel}
            </Link>
          </Button>
        );
      }
      return null;
    };

    const tileKeys = invoiceTiles({ primary, voided: isVoid, receiptable, canTakePayment });
    const tiles = tileKeys.map((tile) => {
      switch (tile) {
        case "pay":
          // A draft's big button is Send; a deposit or cash sale is this tile.
          return <Fragment key="pay">{paymentDialog("lg", "tile")}</Fragment>;
        case "send":
          // Two tiles of the one send dialog: "Send again" and "Message".
          return (
            <SendDocumentDialog
              key="send"
              doc={quietDoc}
              previewAction={previewInvoiceSendAction}
              sendAction={sendInvoiceAction}
              size="lg"
              appearance="tiles"
            />
          );
        case "receipt":
          return (
            <EmailReceiptTile
              key="receipt"
              invoiceId={invoice.id}
              action={emailInvoiceReceiptAction}
              blockedReason={emailBlockedReason}
            />
          );
        case "print":
          return (
            <Link key="print" href={printHref} target="_blank" data-touch-control className={TILE_CLASS}>
              <ACTIONS.print aria-hidden />
              Print
            </Link>
          );
        case "copy":
          return <CopyLinkTile key="copy" url={viewUrl} />;
        case "edit":
          return canEdit ? (
            <Link key="edit" href={`${basePath}/edit`} data-touch-control className={TILE_CLASS}>
              <ACTIONS.edit aria-hidden />
              Edit
            </Link>
          ) : null;
        case "more":
          return <Fragment key="more">{actionMenu(false, true)}</Fragment>;
        default:
          return null;
      }
    });

    // --------------------------------------------------------------- Bill tab
    const paymentRows: MoneyRowData[] = invoice.payments.map((payment) => ({
      id: payment.id,
      kind: "payment",
      title: paymentLabel(
        payment.method,
        payment.reference,
        payment.stripeSource ?? payment.gatewaySource,
        payment.gateway,
      ),
      detail: `${formatDateTime(payment.createdAt)}${payment.takenBy ? ` · taken by ${payment.takenBy.name}` : ""}`,
      reference:
        payment.reference || payment.stripePaymentIntentId ? (
          <PaymentReference
            reference={payment.reference}
            paymentIntentId={payment.stripePaymentIntentId}
          />
        ) : null,
      amountCents: payment.amountCents,
    }));

    const refundRows: MoneyRowData[] = invoice.refunds.map((refund) => ({
      id: refund.id,
      kind: "refund",
      title: `${METHOD_LABELS[refund.method] ?? refund.method}${
        refund.payment
          ? ` · against ${paymentLabel(
              refund.payment.method,
              refund.payment.reference,
              refund.payment.stripeSource,
            )}`
          : ""
      }`,
      detail: `${formatDateTime(refund.createdAt)}${refund.refundedBy ? ` · by ${refund.refundedBy.name}` : ""}`,
      note: refund.reason,
      badge: <RefundStatusBadge status={refund.status} />,
      reference: refund.stripeRefundId ? (
        <CopyableId value={refund.stripeRefundId} label="Stripe refund id" />
      ) : null,
      amountCents: refund.amountCents,
      failed: refund.status === "failed",
    }));

    // The receipt block. What the Balance card used to hold (paid to date,
    // refunded, net paid, balance due) is under the total, so the whole ledger
    // reads top to bottom in one place.
    const totalRows: TotalRow[] = [
      { label: "Subtotal", value: formatCents(totals.subtotalCents) },
      {
        label: taxLabel(invoice.taxRate?.name, invoice.taxRateBps),
        value: formatCents(totals.taxCents),
      },
      {
        label: "Total",
        value: formatCents(totals.totalCents),
        size: "large",
        divider: true,
        struck: isVoid,
      },
    ];
    if (isVoid) {
      totalRows.push({
        label: "Balance due",
        value: formatCents(Math.max(totals.balanceCents, 0)),
        struck: true,
        tone: "muted",
      });
    } else {
      totalRows.push({
        label: "Paid to date",
        value: `${totals.paidCents > 0 ? "−" : ""}${formatCents(totals.paidCents)}`,
        divider: true,
      });
      if (hasRefunds) {
        totalRows.push(
          { label: "Refunded", value: `+${formatCents(totals.refundedCents)}`, tone: "alert" },
          { label: "Net paid", value: formatCents(totals.netPaidCents) },
        );
      }
      totalRows.push(
        settled
          ? { label: "Balance", value: "Paid in full", size: "large", tone: "good", divider: true }
          : {
              label: "Balance due",
              value: formatCents(totals.balanceCents),
              size: "large",
              tone: overdue ? "alert" : undefined,
              divider: true,
            },
      );
    }

    const billPanel = (
      <>
        {unbilledEntries.length > 0 ? (
          <UnbilledTimeBanner
            large
            invoiceId={invoice.id}
            entryCount={unbilledEntries.length}
            durationLabel={formatHm(unbilledSeconds)}
            amountLabel={formatCents(unbilledCents)}
          />
        ) : null}

        <Section title="Items">
          {invoice.lines.length === 0 ? (
            // A bill with nothing on it cannot be sent or paid, so the way out
            // is the edit screen.
            <EmptyLines
              title="Nothing billed yet"
              hint="Add the parts, labour and products this invoice covers before you send it."
              action={
                canEdit ? (
                  <Button asChild className="h-12 px-6 text-base">
                    <Link href={`${basePath}/edit`}>
                      <ACTIONS.add /> Add line items
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <LineList lines={invoice.lines} struck={isVoid} />
          )}
        </Section>

        {invoice.lines.length > 0 ? <TotalsBlock rows={totalRows} /> : null}

        <Section
          title="Payments"
          action={
            hasPayments ? (
              <span className="rf-num rounded-lg bg-surface-hover px-2.5 py-1 text-sm font-semibold text-status-resolved-fg">
                {formatCents(totals.paidCents)} collected
              </span>
            ) : null
          }
        >
          <MoneyRows
            rows={paymentRows}
            empty={
              isVoid
                ? "This invoice was voided before any money came in."
                : "Nothing collected yet. Every payment taken against this invoice is listed here, with who took it and when."
            }
            footer={
              canRefund ? (
                <div className="w-fit [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:px-5 [&_[data-slot=button]]:text-base">
                  <RefundDialog
                    action={refundInvoiceAction}
                    invoiceId={invoice.id}
                    refundableCents={totals.refundableCents}
                    payments={refundablePayments}
                    customerName={customerName}
                    defaultMethod={paidWithCredit ? "CREDIT" : "CARD"}
                    size="lg"
                  />
                </div>
              ) : null
            }
          />
        </Section>

        {/* Only once something has been refunded: a permanently empty
            "Refunds" block on every invoice would be noise. */}
        {hasRefunds ? (
          <Section
            title="Refunds"
            action={
              <span className="rf-num rounded-lg bg-destructive-soft px-2.5 py-1 text-sm font-semibold text-destructive">
                {formatCents(totals.refundedCents)} returned
              </span>
            }
          >
            <MoneyRows rows={refundRows} />
          </Section>
        ) : null}

        {invoice.notes ? (
          <Section title="Notes">
            <p className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-base leading-relaxed text-muted-foreground">
              {invoice.notes}
            </p>
          </Section>
        ) : null}
      </>
    );

    // ----------------------------------------------------------- Customer tab
    const credit = invoice.customer.creditBalanceCents;
    const cardText = savedCard
      ? `${savedCard.brand} ····${savedCard.last4}${
          savedCard.expMonth && savedCard.expYear
            ? ` · expires ${String(savedCard.expMonth).padStart(2, "0")}/${String(savedCard.expYear).slice(-2)}`
            : ""
        }${cardExpired(savedCard, new Date(now)) ? " (expired)" : ""}`
      : null;
    const telLink = (value: string) => (
      <a href={`tel:${value}`} className="rf-num text-accent-soft-foreground hover:underline">
        {value}
      </a>
    );

    const customerPanel = (
      <>
        <Section title="Customer">
          <FactList
            facts={[
              {
                label: "Name",
                value: (
                  <Link
                    href={`/customers/${invoice.customer.id}`}
                    className="text-accent-soft-foreground hover:underline"
                  >
                    {customerName}
                  </Link>
                ),
              },
              ...(invoice.customer.mobile ? [{ label: "Mobile", value: telLink(invoice.customer.mobile) }] : []),
              ...(invoice.customer.phone ? [{ label: "Phone", value: telLink(invoice.customer.phone) }] : []),
              {
                label: "Email",
                value: invoice.customer.email ? (
                  <a
                    href={`mailto:${invoice.customer.email}`}
                    className="text-accent-soft-foreground hover:underline"
                  >
                    {invoice.customer.email}
                  </a>
                ) : (
                  <span className="text-faint-foreground">None on file</span>
                ),
              },
              {
                label: "Card on file",
                value: cardText ? (
                  <span className="capitalize">{cardText}</span>
                ) : (
                  <span className="text-faint-foreground">None saved</span>
                ),
              },
            ]}
          />
          {credit > 0 ? (
            <p className="rf-num rounded-2xl bg-accent-soft p-4 text-base font-medium text-accent-soft-foreground">
              {customerName} holds {formatCents(credit)} in store credit.
            </p>
          ) : null}
        </Section>

        <Section title="This invoice">
          <FactList
            facts={[
              { label: "Issued", value: formatDate(invoice.createdAt) },
              {
                label: "Due",
                value: (
                  <span className={cn(overdue && "font-semibold text-status-overdue-fg")}>
                    {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                    {overdue ? " (overdue)" : ""}
                  </span>
                ),
              },
              ...(invoice.paidAt ? [{ label: "Paid on", value: formatDate(invoice.paidAt) }] : []),
              {
                label: "Repair",
                value: invoice.ticket ? (
                  <Link
                    href={`/tickets/${invoice.ticket.id}`}
                    className="text-accent-soft-foreground hover:underline"
                  >
                    #{invoice.ticket.number}
                    {invoice.ticket.subject ? ` · ${invoice.ticket.subject}` : ""}
                  </Link>
                ) : (
                  "—"
                ),
              },
              ...(invoice.estimate
                ? [
                    {
                      label: "From estimate",
                      value: (
                        <Link
                          href={`/estimates/${invoice.estimate.id}`}
                          className="text-accent-soft-foreground hover:underline"
                        >
                          #{invoice.estimate.number}
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      </>
    );

    // ----------------------------------------------------------- Activity tab
    // Loaded only when the tab is open: the other three never read it.
    const messages =
      tab === "activity"
        ? await db.communicationLog.findMany({
            where: { shopId, invoiceId: invoice.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              createdAt: true,
              type: true,
              direction: true,
              to: true,
              subject: true,
              status: true,
            },
          })
        : [];
    const activityPanel = (
      <Section title="Activity">
        <ActivityList
          items={invoiceActivity({
            createdAt: invoice.createdAt,
            paidAt: invoice.paidAt,
            settled,
            payments: invoice.payments.map((payment) => ({
              id: payment.id,
              createdAt: payment.createdAt,
              amountCents: payment.amountCents,
              label: paymentLabel(
                payment.method,
                payment.reference,
                payment.stripeSource ?? payment.gatewaySource,
                payment.gateway,
              ),
              takenBy: payment.takenBy?.name ?? null,
            })),
            refunds: invoice.refunds.map((refund) => ({
              id: refund.id,
              createdAt: refund.createdAt,
              amountCents: refund.amountCents,
              reason: refund.reason,
              failed: refund.status === "failed",
              takenBy: refund.refundedBy?.name ?? null,
            })),
            messages,
          })}
        />
      </Section>
    );

    // -------------------------------------------------------------- Share tab
    const sharePanel = (
      <>
        <Section
          title="Customer links"
          action={
            onlinePayments ? (
              <span className="rounded-lg bg-chip-accent-bg px-2.5 py-1 text-sm font-semibold text-chip-accent-fg">
                Online payments live
              </span>
            ) : null
          }
        >
          {isVoid ? (
            <p className="text-base text-muted-foreground">A voided invoice has nothing to share.</p>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <p className="text-base leading-snug text-muted-foreground">
                The view link never expires and opens their page with no sign-in.
                {canCopyPaymentLink
                  ? " The payment link is made fresh for the balance as it stands now."
                  : ""}
              </p>
              <ShareRow
                large
                viewUrl={viewUrl}
                payment={
                  canCopyPaymentLink
                    ? { invoiceId: invoice.id, action: invoicePaymentLinkAction }
                    : null
                }
              />
            </div>
          )}
        </Section>

        <Section title="Customer signature">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            {invoice.signatureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.signatureDataUrl}
                alt={`Signature of ${customerName}`}
                className="h-28 w-full rounded-xl border border-border bg-white object-contain p-2"
              />
            ) : (
              <p className="text-base text-muted-foreground">Not signed yet.</p>
            )}
            {!isVoid ? (
              <div className="w-fit [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:px-5 [&_[data-slot=button]]:text-base">
                <SignatureDialog
                  action={saveInvoiceSignatureAction}
                  documentId={invoice.id}
                  title="Collect signature"
                  description={`Have ${customerName} sign to acknowledge invoice #${invoice.number}.`}
                  triggerLabel={invoice.signatureDataUrl ? "Re-sign" : "Collect signature"}
                  triggerSize="lg"
                />
              </div>
            ) : null}
          </div>
        </Section>
      </>
    );

    const panel =
      tab === "customer"
        ? customerPanel
        : tab === "activity"
          ? activityPanel
          : tab === "share"
            ? sharePanel
            : billPanel;
    const pinned = bigAction();

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <BackLink label="Invoices" href="/invoices" />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* The summary is first in the page (and on a phone) and sits in the right
              column from lg up, so the order a finger or a screen reader meets
              things in is the order they are read. */}
          <BillSummary
            className="lg:col-start-2 lg:row-start-1"
            title={`Invoice #${invoice.number}`}
            status={<InvoiceStatusBadge status={invoice.status} size="md" />}
            customer={{
              name: customerName,
              href: `/customers/${invoice.customer.id}`,
              phone,
            }}
            hero={<BalanceHero block={block} />}
            primary={bigAction()}
            tiles={tiles}
            tileCount={tileKeys.length}
            hint={lastSentHint}
          />

          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            <FilterTabs aria-label="Invoice sections" tabs={docTabs(basePath, tab, "Bill")} />
            {panel}
          </div>
        </div>

        {pinned ? (
          <PinnedAction
            caption={primary === "pay" && block.figure ? { label: "Balance due", value: block.figure } : null}
          >
            {pinned}
          </PinnedAction>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {fullHeader}

      {/* -------------------------------------------------------------- body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
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
