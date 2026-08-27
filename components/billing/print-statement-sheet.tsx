import * as React from "react";

import { formatCents } from "@/lib/money";
import { formatDate } from "@/components/billing/format";
import { invoiceStatusLabel } from "@/components/billing/status-badge";
import type {
  StatementData,
  StatementInvoice,
} from "@/components/statements/query";
import {
  PAYMENT_METHOD_LABELS,
  addressLines,
  statementCustomerName,
} from "@/components/statements/query";
import {
  Masthead,
  MetaTable,
  PartyBlock,
  SectionHead,
  SheetFooter,
  daysPast,
} from "./print-chrome";
import { PrintToolbar } from "./print-toolbar";

/**
 * The printable customer statement behind /print/statements/[customerId].
 *
 * It does NOT reuse `PrintSheet`: that sheet is built around one document's
 * line items, its balance panel and its signature block, none of which a
 * statement has. What the two DO share is the house style — the masthead, the
 * meta table, the totals panel and the footer all come from print-chrome, so
 * the statement is unmistakably the same shop's paper as the invoice.
 *
 * The addition over the old sheet is aging: a statement whose only number is
 * "outstanding" tells an accounts department nothing it can act on. Each row
 * carries how far past due it is, overdue rows are marked, and the five
 * standard buckets are totalled underneath.
 */

/**
 * Age from the due date; an invoice with no due date was due on receipt.
 *
 * A DRAFT has never been sent, so it cannot be late however old it is — it
 * still counts toward the balance (that is `loadStatement`'s call, not this
 * sheet's) but it ages as Current. Dunning a customer for an invoice they were
 * never shown is the fastest way to make a statement untrustworthy.
 */
function invoiceAge(invoice: StatementInvoice, now: Date): number {
  if (invoice.status === "DRAFT") return 0;
  return daysPast(invoice.dueDate ?? invoice.createdAt, now);
}

const BUCKETS = [
  { label: "Current", min: 0, max: 0 },
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "Over 90 days", min: 91, max: Infinity },
] as const;

export function StatementSheet({
  statement,
  from,
  to,
  backHref,
  logoUrl,
}: {
  statement: StatementData;
  from: Date;
  to: Date;
  backHref: string;
  logoUrl?: string | null;
}) {
  const { shop, customer, invoices, payments, totals } = statement;
  const name = statementCustomerName(customer);
  const now = new Date();
  const range = `${formatDate(from)} – ${formatDate(to)}`;

  // Void invoices are not a debt, so they are shown but never aged or totalled.
  const owing = invoices.filter(
    (invoice) => invoice.status !== "VOID" && invoice.balanceCents > 0
  );
  const buckets = BUCKETS.map((bucket) => ({
    label: bucket.label,
    cents: owing
      .filter((invoice) => {
        const age = invoiceAge(invoice, now);
        return age >= bucket.min && age <= bucket.max;
      })
      .reduce((sum, invoice) => sum + invoice.balanceCents, 0),
    overdue: bucket.min > 0,
  }));

  const contact = [shop.phone, shop.email].filter(Boolean).join("  ·  ");

  return (
    <>
      <PrintToolbar
        backHref={backHref}
        backLabel={`Back to ${name}`}
        title={`Statement · ${range}`}
      />

      <article className="rf-sheet">
        <div className="rf-body">
          <Masthead
            shop={{ name: shop.name, lines: addressLines(shop) }}
            logoUrl={logoUrl}
            docLabel="Statement"
            docNumber={range}
          />

          <section className="rf-cols">
            <PartyBlock
              label="Account"
              party={{ name, lines: addressLines(customer) }}
            />
            <MetaTable
              rows={[
                { label: "Statement date", value: formatDate(now) },
                { label: "Period from", value: formatDate(from) },
                { label: "Period to", value: formatDate(to) },
                {
                  label: "Invoices",
                  value: String(invoices.length),
                },
              ]}
            />
          </section>

          {/* -------------------------------------------------- activity --- */}
          <section className="rf-section">
            <SectionHead
              title="Account activity"
              aside={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} in period`}
            />
            <table className="rf-items is-dense">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "0.75in" }}>
                    Invoice
                  </th>
                  <th scope="col" style={{ width: "0.95in" }}>
                    Issued
                  </th>
                  <th scope="col" style={{ width: "0.95in" }}>
                    Due
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ width: "0.7in", textAlign: "right" }}>
                    Age
                  </th>
                  <th scope="col" style={{ width: "1in", textAlign: "right" }}>
                    Total
                  </th>
                  <th scope="col" style={{ width: "1in", textAlign: "right" }}>
                    Paid
                  </th>
                  <th scope="col" style={{ width: "1in", textAlign: "right" }}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const void_ = invoice.status === "VOID";
                  const balance = Math.max(0, invoice.balanceCents);
                  const age = invoiceAge(invoice, now);
                  const overdue = !void_ && balance > 0 && age > 0;

                  return (
                    <tr
                      key={invoice.id}
                      className={overdue ? "is-overdue" : undefined}
                    >
                      <td className="rf-num" style={{ textAlign: "left" }}>
                        #{invoice.number}
                      </td>
                      <td className="rf-num" style={{ textAlign: "left" }}>
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="rf-num" style={{ textAlign: "left" }}>
                        {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                      </td>
                      <td>
                        {overdue ? (
                          <span className="rf-tag rf-tag-alarm">Overdue</span>
                        ) : (
                          invoiceStatusLabel(invoice.status)
                        )}
                      </td>
                      <td className="rf-num">{overdue ? `${age} d` : "—"}</td>
                      <td className="rf-num">{formatCents(invoice.totalCents)}</td>
                      <td className="rf-num">{formatCents(invoice.paidCents)}</td>
                      <td className="rf-num">
                        {void_ ? "—" : formatCents(balance)}
                      </td>
                    </tr>
                  );
                })}
                {invoices.length === 0 ? (
                  <tr>
                    <td className="rf-empty" colSpan={8}>
                      No invoices in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {/* ----------------------------------------------------- aging --- */}
          {totals.outstandingCents > 0 ? (
            <section className="rf-section-tight rf-avoid">
              <SectionHead title="Aging summary" />
              <div className="rf-aging">
                {buckets.map((bucket) => (
                  <div
                    key={bucket.label}
                    className={
                      bucket.overdue && bucket.cents > 0 ? "is-alarm" : undefined
                    }
                  >
                    <div className="rf-aging-label">{bucket.label}</div>
                    <div className="rf-aging-value">
                      {formatCents(bucket.cents)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* -------------------------------------------------- payments --- */}
          {payments.length > 0 ? (
            <section className="rf-section rf-avoid">
              <SectionHead title="Payments received" />
              <table className="rf-mini">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col" style={{ textAlign: "right" }}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="rf-num" style={{ textAlign: "left" }}>
                        {formatDate(payment.createdAt)}
                      </td>
                      <td className="rf-num" style={{ textAlign: "left" }}>
                        #{payment.invoiceNumber}
                      </td>
                      <td>
                        {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                      </td>
                      <td className="rf-muted">{payment.reference || "—"}</td>
                      <td className="rf-num">{formatCents(payment.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* ---------------------------------------------------- totals --- */}
          <section className="rf-totals-wrap">
            <div className="rf-totals-panel">
              <table className="rf-totals">
                <tbody>
                  <tr>
                    <td className="rf-t-label">Invoiced this period</td>
                    <td className="rf-t-value">
                      {formatCents(totals.invoicedCents)}
                    </td>
                  </tr>
                  <tr>
                    <td className="rf-t-label">Payments received</td>
                    <td className="rf-t-value">
                      -{formatCents(totals.paidCents)}
                    </td>
                  </tr>
                  {totals.creditBalanceCents > 0 ? (
                    <tr>
                      <td className="rf-t-label">Store credit on account</td>
                      <td className="rf-t-value">
                        {formatCents(totals.creditBalanceCents)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="rf-balance">
                <span className="rf-balance-label">Amount due</span>
                <span className="rf-balance-value">
                  {formatCents(totals.outstandingCents)}
                </span>
              </div>
            </div>
          </section>

          <SheetFooter
            message={
              totals.outstandingCents > 0
                ? `Please remit ${formatCents(totals.outstandingCents)} at your earliest convenience.`
                : "Your account is fully settled — thank you."
            }
            contact={
              contact
                ? `Questions about this statement? ${contact}`
                : `Questions about this statement? Contact ${shop.name}.`
            }
          />
        </div>
      </article>
    </>
  );
}
