import * as React from "react";

import { formatCents } from "@/lib/money";
import { formatDate } from "@/components/billing/format";
import { invoiceStatusLabel } from "@/components/billing/status-badge";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import {
  PAYMENT_METHOD_LABELS,
  addressLines,
  statementCustomerName,
  type StatementData,
} from "./query";

/**
 * The printable sheet behind /print/statements/[customerId].
 *
 * It deliberately does NOT reuse components/billing/print-sheet: that sheet is
 * built around one document's line items, a barcode and a signature block, none
 * of which a statement has. What it does share is the visual language — fixed
 * neutral colours rather than theme tokens, because this markup ends up on
 * paper where a dark palette prints as a black rectangle — and the print CSS
 * from app/print/layout.tsx, which both routes sit under.
 */
export function StatementSheet({
  statement,
  from,
  to,
  backHref,
}: {
  statement: StatementData;
  from: Date;
  to: Date;
  backHref: string;
}) {
  const { shop, customer, invoices, payments, totals } = statement;
  const name = statementCustomerName(customer);
  const range = `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <>
      <PrintToolbar backHref={backHref} backLabel={`Back to ${name}`} />

      <div className="print-sheet relative mx-auto w-full max-w-[8.5in] bg-white px-8 pb-10 text-[12px] leading-relaxed text-neutral-900 print:px-0">
        {/* ------------------------------------------------------- masthead */}
        <header className="flex items-start justify-between gap-8 border-b-2 border-neutral-900 pb-5">
          <div>
            <h1 className="text-[19px] font-bold tracking-tight text-neutral-900">
              {shop.name}
            </h1>
            <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-600">
              {addressLines(shop).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[26px] font-bold uppercase tracking-[0.18em] text-neutral-900">
              STATEMENT
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {range}
            </div>
          </div>
        </header>

        {/* --------------------------------------------- account and period */}
        <section className="mt-6 flex items-start justify-between gap-10">
          <div className="min-w-0">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Account
            </h2>
            <div className="mt-1.5">
              <div className="text-[13px] font-semibold text-neutral-900">{name}</div>
              <div className="mt-0.5 space-y-0.5 text-[11px] text-neutral-600">
                {addressLines(customer).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          </div>

          <table className="shrink-0 border-collapse text-[11px]">
            <tbody>
              <MetaRow label="Statement date" value={formatDate(new Date())} />
              <MetaRow label="Period from" value={formatDate(from)} />
              <MetaRow label="Period to" value={formatDate(to)} />
            </tbody>
          </table>
        </section>

        {/* -------------------------------------------------------- invoices */}
        <section className="mt-7">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Invoices
          </h2>
          <table className="mt-1.5 w-full border-collapse">
            <thead>
              <tr className="bg-neutral-900 text-white">
                <Th className="w-[70px] text-left">Invoice</Th>
                <Th className="w-[95px] text-left">Date</Th>
                <Th className="w-[80px] text-left">Status</Th>
                <Th className="w-[95px] text-left">Due</Th>
                <Th className="w-[85px] text-right">Total</Th>
                <Th className="w-[85px] text-right">Paid</Th>
                <Th className="w-[85px] text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice, index) => (
                <tr
                  key={invoice.id}
                  className={index % 2 === 1 ? "bg-neutral-50" : undefined}
                >
                  <Td className="font-mono">#{invoice.number}</Td>
                  <Td className="font-mono">{formatDate(invoice.createdAt)}</Td>
                  <Td>{invoiceStatusLabel(invoice.status)}</Td>
                  <Td className="font-mono">
                    {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                  </Td>
                  <Td className="text-right font-mono">
                    {formatCents(invoice.totalCents)}
                  </Td>
                  <Td className="text-right font-mono">
                    {formatCents(invoice.paidCents)}
                  </Td>
                  <Td className="text-right font-mono">
                    {invoice.status === "VOID"
                      ? "—"
                      : formatCents(Math.max(0, invoice.balanceCents))}
                  </Td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <Td className="text-center text-neutral-500" colSpan={7}>
                    No invoices in this period.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* -------------------------------------------------------- payments */}
        {payments.length > 0 ? (
          <section className="mt-7 break-inside-avoid">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Payments received
            </h2>
            <table className="mt-1.5 w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-neutral-300 text-neutral-600">
                  <th className="py-1 text-left font-semibold">Date</th>
                  <th className="py-1 text-left font-semibold">Invoice</th>
                  <th className="py-1 text-left font-semibold">Method</th>
                  <th className="py-1 text-left font-semibold">Reference</th>
                  <th className="py-1 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-neutral-200">
                    <td className="py-1 font-mono">{formatDate(payment.createdAt)}</td>
                    <td className="py-1 font-mono">#{payment.invoiceNumber}</td>
                    <td className="py-1">
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </td>
                    <td className="py-1 text-neutral-600">
                      {payment.reference || "—"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {formatCents(payment.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* ---------------------------------------------------------- totals */}
        <section className="mt-6 flex justify-end break-inside-avoid">
          <table className="w-[320px] border-collapse text-[12px]">
            <tbody>
              <TotalRow label="Total invoiced" value={formatCents(totals.invoicedCents)} />
              <TotalRow label="Total paid" value={`-${formatCents(totals.paidCents)}`} />
              <TotalRow
                label="Balance outstanding"
                value={formatCents(totals.outstandingCents)}
                emphasis
              />
              {totals.creditBalanceCents > 0 ? (
                <TotalRow
                  label="Store credit on account"
                  value={formatCents(totals.creditBalanceCents)}
                />
              ) : null}
            </tbody>
          </table>
        </section>

        <footer className="mt-10 border-t border-neutral-300 pt-3 text-center text-[11px] text-neutral-600">
          {totals.outstandingCents > 0
            ? `Please settle ${formatCents(totals.outstandingCents)} at your earliest convenience. Thank you for your business!`
            : "Your account is fully settled. Thank you for your business!"}
        </footer>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="border border-neutral-300 bg-neutral-100 px-3 py-1 text-left font-semibold uppercase tracking-wider text-neutral-600">
        {label}
      </th>
      <td className="border border-neutral-300 px-3 py-1 text-right font-mono text-neutral-900">
        {value}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <td
        className={[
          "py-1 pr-4 text-right text-neutral-600",
          emphasis
            ? "border-t-2 border-neutral-900 pt-2 text-[14px] font-bold uppercase tracking-wide text-neutral-900"
            : "",
        ].join(" ")}
      >
        {label}
      </td>
      <td
        className={[
          "py-1 text-right font-mono text-neutral-800",
          emphasis
            ? "border-t-2 border-neutral-900 pt-2 text-[16px] font-bold text-neutral-900"
            : "",
        ].join(" ")}
      >
        {value}
      </td>
    </tr>
  );
}

function Th({
  className = "",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${className}`}
      {...props}
    />
  );
}

function Td({
  className = "",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`border-b border-neutral-200 px-2.5 py-1.5 align-top ${className}`}
      {...props}
    />
  );
}
