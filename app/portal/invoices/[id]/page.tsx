import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { formatDate } from "@/components/billing/format";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { requirePortalCustomer } from "@/lib/portal-session";
import {
  BackLink,
  PortalCard,
  PortalCardHeader,
  PortalShell,
} from "../../_components/shell";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await requirePortalCustomer(`/portal/invoices/${id}`);

  const invoice = await db.invoice.findFirst({
    where: { id, customerId: customer.id, shopId: customer.shopId },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      dueDate: true,
      paidAt: true,
      notes: true,
      taxRateBps: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
          serial: true,
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

        <Link
          href={`/portal/invoices/${invoice.id}/print`}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-[14px] font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-hover"
        >
          <Download className="size-4" />
          Download PDF
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {/* The number that actually matters, said once, in large type. */}
        <PortalCard className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
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
                ? `Payable to ${customer.shop.name}. Give the shop a call or pay when you collect your device.`
                : "Paid in full — thank you!"}
          </p>
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
                label={`Sales tax (${formatBps(invoice.taxRateBps)})`}
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
                      {METHOD_LABELS[payment.method] ?? payment.method}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {formatDate(payment.createdAt)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
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
