import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";

import { formatDate } from "@/components/billing/format";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
import { ACTIONS } from "@/components/ui/icons";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
import { taxLabel } from "@/lib/tax";
import { isStripeReference, paymentsLive } from "@/lib/payments";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import { warrantyLabel } from "@/lib/warranty";
import { PayOnlineButton } from "../../_components/pay-online";
import {
  BackLink,
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../../_components/shell";

const PrintIcon = ACTIONS.print;

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

/** Statuses a customer is allowed to pay against. */
const PAYABLE = new Set(["SENT", "PARTIAL"]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Scoped through the cookie, like the render — see the ticket page for why. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Invoice · RepairFlow" };

  const invoice = await db.invoice.findFirst({
    where: {
      id,
      customerId: session.customerId,
      shopId: session.shopId,
      // A draft has not been sent; the customer must not learn it exists.
      status: { not: "DRAFT" },
    },
    select: { number: true },
  });
  return {
    title: invoice
      ? `Invoice #${invoice.number} · RepairFlow`
      : "Invoice · RepairFlow",
  };
}

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const customer = await requirePortalCustomer(`/portal/invoices/${id}`);

  const invoice = await db.invoice.findFirst({
    where: {
      id,
      customerId: customer.id,
      shopId: customer.shopId,
      // Unsent means invisible — a draft 404s rather than rendering.
      status: { not: "DRAFT" },
    },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      dueDate: true,
      paidAt: true,
      notes: true,
      taxRateBps: true,
      taxRate: { select: { name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
          serial: true,
          warrantyDays: true,
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          amountCents: true,
          method: true,
          reference: true,
        },
      },
    },
  });
  if (!invoice) notFound();

  const totals = invoiceTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments,
  );
  const balance = Math.max(totals.balanceCents, 0);

  // The button only exists when a real processor is behind it, the invoice is
  // one the customer has been shown, and something is actually owed.
  const canPayOnline =
    paymentsLive() && balance > 0 && PAYABLE.has(invoice.status);

  const justPaid = first(query.paid) === "1";
  const canceled = first(query.canceled) === "1";
  const payError = first(query.payerror);

  return (
    <PortalShell
      shopName={customer.shop.name}
      customerName={`${customer.firstName} ${customer.lastName}`}
    >
      <BackLink href="/portal/home">Back to your portal</BackLink>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">
              Invoice #{invoice.number}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Issued {formatDate(invoice.createdAt)}
            {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
          </p>
        </div>

        {/*
          Named for what it does. Nothing is downloaded here — the link opens
          the printable sheet, whose own button hands the browser's print dialog
          (and its "Save as PDF") to the customer. A "Download PDF" button that
          never puts a file in the downloads folder is a support call.
        */}
        <Link
          href={`/portal/invoices/${invoice.id}/print`}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-[14px] font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PrintIcon className="size-4" aria-hidden />
          Print or save as PDF
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {/*
          `?paid=1` is only a hint from the browser Stripe sent back — the money
          is not ours until the webhook says so. So the banner reports what the
          BALANCE says, not what the query string claims: still owing means the
          confirmation is in flight, not that the payment failed.
        */}
        {justPaid ? (
          balance > 0 ? (
            <Banner
              tone="pending"
              icon={Clock}
              title="Payment processing"
              body="Your card has been submitted. This page will show it as received within a minute or two — there is nothing more for you to do."
            />
          ) : (
            <Banner
              tone="good"
              icon={CheckCircle2}
              title="Payment received — thank you!"
              body={`${customer.shop.name} has your payment in full.`}
            />
          )
        ) : null}

        {canceled ? (
          <Banner
            tone="quiet"
            icon={AlertCircle}
            title="Payment canceled"
            body="Nothing was charged. You can pay whenever you're ready."
          />
        ) : null}

        {payError ? (
          <Banner tone="quiet" icon={AlertCircle} title="Couldn't start that payment" body={payError} />
        ) : null}

        {/* The number that actually matters, said once, in large type. */}
        <PortalCard className="flex flex-col gap-5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
                {balance > 0 ? "Balance due" : "Balance"}
              </div>
              <div className="mt-1 font-mono text-3xl font-bold tracking-tight">
                {formatCents(balance)}
              </div>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {invoice.status === "VOID"
                ? "This invoice has been voided — nothing is owed."
                : balance > 0
                  ? canPayOnline
                    ? `Payable to ${customer.shop.name}. Pay by card below, or settle up when you collect your device.`
                    : `Payable to ${customer.shop.name}. Give the shop a call or pay when you collect your device.`
                  : "Paid in full — thank you!"}
            </p>
          </div>

          {canPayOnline ? (
            <div className="border-t border-border pt-5">
              <PayOnlineButton
                invoiceId={invoice.id}
                amountLabel={formatCents(balance)}
              />
            </div>
          ) : null}
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="What you're being charged for" />
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
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 sm:px-6">
                      {line.description}
                      {line.serial ? (
                        <span className="ml-2 font-mono text-[12px] text-muted-foreground">
                          {line.serial}
                        </span>
                      ) : null}
                      {line.warrantyDays ? (
                        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                          Warranty: {warrantyLabel(line.warrantyDays)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {line.quantity}
                    </td>
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
              <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
              <TotalRow
                label={taxLabel(invoice.taxRate?.name, invoice.taxRateBps)}
                value={formatCents(totals.taxCents)}
              />
              <TotalRow
                label="Total"
                value={formatCents(totals.totalCents)}
                strong
              />
              {totals.paidCents > 0 ? (
                <TotalRow
                  label="Payments received"
                  value={`-${formatCents(totals.paidCents)}`}
                />
              ) : null}
              <TotalRow label="Balance due" value={formatCents(balance)} emphasis />
            </dl>
          </div>
        </PortalCard>

        {invoice.payments.length > 0 ? (
          <PortalCard>
            <PortalCardHeader title="Payments received" />
            <ul className="divide-y divide-border">
              {invoice.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 text-[14px] sm:px-6"
                >
                  <div>
                    <div className="font-medium">
                      {isStripeReference(payment.reference)
                        ? "Card (online)"
                        : (METHOD_LABELS[payment.method] ?? payment.method)}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {formatDate(payment.createdAt)}
                      {/* A Stripe session id means nothing to a customer. */}
                      {payment.reference && !isStripeReference(payment.reference)
                        ? ` · ${payment.reference}`
                        : ""}
                    </div>
                  </div>
                  <span className="font-mono font-semibold">
                    {formatCents(payment.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </PortalCard>
        ) : null}

        {invoice.notes ? (
          <PortalCard className="px-5 py-5 sm:px-6">
            <h2 className="text-[13px] font-semibold">Notes from the shop</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-muted-foreground">
              {invoice.notes}
            </p>
          </PortalCard>
        ) : null}
      </div>
    </PortalShell>
  );
}

/**
 * A one-line status message above the balance. Three tones, no dismiss button:
 * these appear because of something the customer just did, and they disappear
 * on the next navigation.
 */
function Banner({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: "good" | "pending" | "quiet";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  const tones = {
    good: "border-status-resolved/30 bg-status-resolved-bg text-status-resolved-fg",
    pending: "border-status-in-progress/30 bg-status-in-progress-bg text-status-in-progress-fg",
    quiet: "border-border-strong bg-surface text-muted-foreground",
  } as const;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border px-5 py-4 shadow-sm ${tones[tone]}`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="text-[14.5px] font-semibold">{title}</div>
        <p className="mt-0.5 text-[13.5px] leading-relaxed opacity-90">{body}</p>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  emphasis,
}: {
  label: string;
  value: string;
  strong?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "flex items-baseline justify-between border-t border-border-strong pt-2.5"
          : "flex items-baseline justify-between"
      }
    >
      <dt
        className={
          strong || emphasis
            ? "font-semibold text-foreground"
            : "text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? "font-mono text-[17px] font-bold"
            : strong
              ? "font-mono font-semibold"
              : "font-mono text-muted-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
