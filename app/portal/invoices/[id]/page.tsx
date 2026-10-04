import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Phone, Printer } from "lucide-react";

import { LineRows, TotalsBlock } from "@/components/public/line-rows";
import { HUGE_BUTTON, TOUCH_LINK } from "@/components/public/sizes";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { refundAwareTotals } from "@/components/billing/refund-math";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { isStripeReference, paymentsLive } from "@/lib/payments";
import { squareConnectionStatus } from "@/lib/payments/square";
import { dayWords, dueWords, invoiceWords, itemCount, telHref } from "@/lib/portal-display";
import { getPortalSession, requirePortalCustomer } from "@/lib/portal-session";
import { taxLabel } from "@/lib/tax";
import { warrantyLabel } from "@/lib/warranty";
import { PayOnlineButton } from "../../_components/pay-online";
import { BackLink, PortalCard, PortalShell } from "../../_components/shell";
import { loadPortalShop } from "../../_components/shop";

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

/** Scoped through the cookie, like the render; see the repair page for why. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPortalSession();
  if (!session) return { title: "Invoice · Repairs helper" };

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
  return { title: invoice ? `Invoice #${invoice.number} · Repairs helper` : "Invoice · Repairs helper" };
}

/**
 * A bill, like a receipt: the amount to pay in huge type, when it is due in
 * words, and ONE button: Pay online when the shop takes cards here, otherwise
 * Call the shop. Paid bills say so with a tick. The items are simple rows that
 * wrap on a phone, and the PDF is a quiet link, not the first button.
 */
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

  const [shop, invoice] = await Promise.all([
    loadPortalShop(customer.shopId),
    db.invoice.findFirst({
      where: {
        id,
        customerId: customer.id,
        shopId: customer.shopId,
        // Unsent means invisible: a draft 404s rather than rendering.
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        shopId: true,
        number: true,
        status: true,
        createdAt: true,
        dueDate: true,
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
        refunds: { select: { amountCents: true, status: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, amountCents: true, method: true, reference: true },
        },
      },
    }),
  ]);
  if (!invoice) notFound();

  const totals = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
  const balance = Math.max(totals.balanceCents, 0);
  const square = await squareConnectionStatus(invoice.shopId);
  const now = requestNow();
  const zone = shop.timezone;

  // The button only exists when a real processor is behind it, the invoice is
  // one the customer has been shown, and something is actually owed.
  const canPayOnline = (paymentsLive() || square.connected) && balance > 0 && PAYABLE.has(invoice.status);
  const isVoid = invoice.status === "VOID";
  const owing = !isVoid && balance > 0;

  const words = invoiceWords({
    status: invoice.status,
    totalCents: totals.totalCents,
    paidCents: totals.netPaidCents,
    dueDate: invoice.dueDate,
    nowMs: now,
    zone,
  });
  const due = invoice.dueDate && owing ? dueWords(invoice.dueDate, now, zone) : null;

  const justPaid = first(query.paid) === "1";
  const canceled = first(query.canceled) === "1";
  const payError = first(query.payerror);

  return (
    <PortalShell shop={shop} customerName={`${customer.firstName} ${customer.lastName}`.trim()}>
      <BackLink href="/portal/home">Back to your repairs</BackLink>

      <div className="flex flex-col gap-6">
        {/*
          `?paid=1` is only a hint from the browser the card page sent back: the
          money is not ours until the webhook says so. So the banner reports
          what the BALANCE says, not what the query string claims: still owing
          means the confirmation is in flight, not that the payment failed.
        */}
        {justPaid ? (
          balance > 0 ? (
            <Banner
              icon={Clock}
              title="Payment processing"
              body="Your card has been submitted. This page will show it as received within a minute or two. There is nothing more for you to do."
            />
          ) : (
            <Banner icon={CheckCircle2} title="Payment received, thank you" body={`${shop.name} has your payment in full.`} />
          )
        ) : null}
        {canceled ? <Banner icon={AlertCircle} title="Payment cancelled" body="Nothing was charged. You can pay whenever you are ready." /> : null}
        {payError ? <Banner icon={AlertCircle} title="That payment could not start" body={payError} /> : null}

        {/* --------------------------------------- the number that matters -- */}
        <PortalCard className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill size="md" tone={words.tone} label={words.label} />
            <span className="text-[14px] text-muted-foreground">
              Invoice #{invoice.number} · {dayWords(invoice.createdAt, now, zone)}
            </span>
          </div>

          {owing ? (
            <div>
              <p className="text-[15px] font-semibold text-muted-foreground">To pay</p>
              <h1 className="text-[44px] font-bold leading-none tracking-tight tabular-nums">{formatCents(balance)}</h1>
              {due ? <p className={cn("mt-2 text-[15px] font-semibold", due.state === "overdue" ? "text-destructive" : "text-foreground")}>{due.text}</p> : null}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <CheckCircle2 className={cn("mt-1 size-8 shrink-0", isVoid ? "text-muted-foreground" : "text-status-resolved")} aria-hidden />
              <div>
                <h1 className="text-[28px] font-bold leading-tight tracking-tight">
                  {isVoid ? "Cancelled, nothing to pay" : "Paid, thank you"}
                </h1>
                <p className="mt-1 text-[15px] text-muted-foreground">
                  {isVoid ? "The shop cancelled this invoice." : `Total ${formatCents(totals.totalCents)}, paid in full.`}
                </p>
              </div>
            </div>
          )}

          {owing ? (
            canPayOnline ? (
              <PayOnlineButton invoiceId={invoice.id} amountLabel={formatCents(balance)} />
            ) : shop.phone ? (
              <div className="flex flex-col gap-2">
                <Button asChild size="lg" className={HUGE_BUTTON}>
                  <a href={telHref(shop.phone)}>
                    <Phone aria-hidden />
                    Call {shop.phone} to pay
                  </a>
                </Button>
                <p className="text-[15px] text-muted-foreground">Or pay at the counter when you collect your device.</p>
              </div>
            ) : (
              <p className="text-[15px] text-muted-foreground">Pay at the counter when you collect your device.</p>
            )
          ) : null}

          {/*
            Named for what it does. Nothing is downloaded here: the link opens the
            printable sheet, whose own button hands the browser's print dialog
            (and its "Save as PDF") to the customer.
          */}
          <Link href={`/portal/invoices/${invoice.id}/print`} className={cn(TOUCH_LINK, "self-start text-muted-foreground")}>
            <Printer className="size-5" aria-hidden />
            Print or save as PDF
          </Link>
        </PortalCard>

        {/* ------------------------------------------------ what it is for -- */}
        <section aria-labelledby="items-title" className="flex flex-col gap-3">
          <h2 id="items-title" className="text-xl font-semibold">
            What you are paying for <span className="text-muted-foreground">({itemCount(invoice.lines.length)})</span>
          </h2>
          <PortalCard className="overflow-hidden">
            <LineRows
              lines={invoice.lines.map((line) => ({
                ...line,
                warranty: line.warrantyDays ? warrantyLabel(line.warrantyDays) : null,
              }))}
            />
            <TotalsBlock
              rows={[
                { label: "Subtotal", value: formatCents(totals.subtotalCents) },
                { label: taxLabel(invoice.taxRate?.name, invoice.taxRateBps), value: formatCents(totals.taxCents) },
                ...(totals.paidCents > 0
                  ? [
                      { label: "Total", value: formatCents(totals.totalCents) },
                      { label: "Paid so far", value: `-${formatCents(totals.paidCents)}` },
                    ]
                  : []),
                ...(totals.refundedCents > 0 ? [{ label: "Money returned", value: formatCents(totals.refundedCents) }] : []),
                {
                  label: isVoid ? "Total (cancelled)" : totals.paidCents > 0 ? "Left to pay" : "Total",
                  value: formatCents(totals.paidCents > 0 ? balance : totals.totalCents),
                  strong: true,
                },
              ]}
            />
          </PortalCard>
        </section>

        {invoice.payments.length > 0 ? (
          <section aria-labelledby="payments-title" className="flex flex-col gap-3">
            <h2 id="payments-title" className="text-xl font-semibold">Payments received</h2>
            <PortalCard>
              <ul className="divide-y divide-border">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3.5 text-[15px] sm:px-6">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {isStripeReference(payment.reference) ? "Card (online)" : (METHOD_LABELS[payment.method] ?? payment.method)}
                      </div>
                      <div className="text-[14px] text-muted-foreground [overflow-wrap:anywhere]">
                        {dayWords(payment.createdAt, now, zone)}
                        {/* A card processor's session id means nothing to a customer. */}
                        {payment.reference && !isStripeReference(payment.reference) ? ` · ${payment.reference}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCents(payment.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </PortalCard>
          </section>
        ) : null}

        {invoice.notes ? (
          <section aria-labelledby="notes-title" className="flex flex-col gap-2">
            <h2 id="notes-title" className="text-xl font-semibold">Notes from the shop</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{invoice.notes}</p>
          </section>
        ) : null}
      </div>
    </PortalShell>
  );
}

/**
 * A one-line message above the amount, because of something the customer just
 * did (came back from the card page). It goes away on the next navigation.
 */
function Banner({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-border-strong bg-surface px-5 py-4">
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
