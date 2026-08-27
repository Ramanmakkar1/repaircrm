import * as React from "react";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBps, formatCents, invoiceTotals } from "@/lib/money";
import { Barcode } from "@/components/billing/barcode";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import { METHOD_LABELS, type TenderMethod } from "@/components/pos/types";

/**
 * The counter receipt — an 80mm thermal slip, not a letter-sized invoice.
 *
 * It deliberately does NOT reuse components/billing/print-sheet: an invoice is
 * a document with a bill-to block and payment terms, a receipt is a narrow
 * column of monospace that has to survive being torn off a spool. Sharing one
 * component between the two would only make both worse.
 *
 * The layout's `@page { size: letter }` is overridden below; because this style
 * block renders inside the layout's children it wins on document order.
 */

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId } = await requireUser();
  const { invoiceId } = await params;
  const query = await searchParams;

  const [invoice, shop] = await Promise.all([
    db.invoice.findFirst({
      // Scoped: an invoice id from another tenant 404s rather than printing.
      where: { id: invoiceId, shopId },
      include: {
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        lines: { orderBy: { sortOrder: "asc" } },
        payments: {
          orderBy: { createdAt: "asc" },
          include: { takenBy: { select: { name: true } } },
        },
      },
    }),
    db.shop.findUnique({
      where: { id: shopId },
      select: {
        name: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        timezone: true,
      },
    }),
  ]);

  if (!invoice || !shop) notFound();

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
  const changeDueCents = readChange(query.change);

  const cashier = invoice.payments.find((p) => p.takenBy?.name)?.takenBy?.name ?? null;
  const isWalkIn =
    invoice.customer.firstName === "Walk-in" &&
    invoice.customer.lastName === "Customer";
  const customerName = invoice.customer.businessName
    ? invoice.customer.businessName
    : `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim();

  const addressLines = [
    shop.address1,
    shop.address2,
    [[shop.city, shop.state].filter(Boolean).join(", "), shop.postalCode]
      .filter(Boolean)
      .join(" "),
    shop.phone,
  ].filter((line): line is string => Boolean(line && String(line).trim()));

  return (
    <>
      <style>{RECEIPT_CSS}</style>
      <PrintToolbar backHref="/pos" backLabel="Back to POS" />

      <div className="receipt-sheet">
        {/* ------------------------------------------------------------ shop */}
        <div className="rc-center">
          <div className="rc-shop">{shop.name}</div>
          {addressLines.map((line) => (
            <div key={line} className="rc-dim">
              {line}
            </div>
          ))}
        </div>

        <Rule />

        {/* ----------------------------------------------------------- meta */}
        <div className="rc-meta">
          <MetaRow label="Receipt" value={`#${invoice.number}`} />
          <MetaRow
            label="Date"
            value={formatStamp(invoice.paidAt ?? invoice.createdAt, shop.timezone)}
          />
          {cashier ? <MetaRow label="Cashier" value={cashier} /> : null}
          {!isWalkIn ? <MetaRow label="Customer" value={customerName} /> : null}
        </div>

        <Rule />

        {/* ---------------------------------------------------------- lines */}
        <div>
          {invoice.lines.map((line) => (
            <div key={line.id} className="rc-line">
              <div className="rc-line-name">{line.description}</div>
              <div className="rc-line-figures">
                <span className="rc-dim">
                  {line.quantity} × {formatCents(line.unitPriceCents)}
                </span>
                <span className="rc-amount">
                  {formatCents(line.quantity * line.unitPriceCents)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Rule />

        {/* --------------------------------------------------------- totals */}
        <div className="rc-totals">
          <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
          <TotalRow
            label={`Tax ${formatBps(invoice.taxRateBps)}`}
            value={formatCents(totals.taxCents)}
          />
          <div className="rc-grand">
            <span>TOTAL</span>
            <span>{formatCents(totals.totalCents)}</span>
          </div>
        </div>

        <Rule />

        {/* -------------------------------------------------------- payment */}
        <div className="rc-totals">
          {invoice.payments.map((payment) => (
            <React.Fragment key={payment.id}>
              <TotalRow
                label={METHOD_LABELS[payment.method as TenderMethod] ?? payment.method}
                value={formatCents(payment.amountCents)}
              />
              {payment.reference ? (
                <div className="rc-dim rc-ref">{payment.reference}</div>
              ) : null}
            </React.Fragment>
          ))}

          {changeDueCents !== null ? (
            <div className="rc-change">
              <span>CHANGE</span>
              <span>{formatCents(changeDueCents)}</span>
            </div>
          ) : null}

          {totals.balanceCents > 0 ? (
            <div className="rc-grand">
              <span>BALANCE DUE</span>
              <span>{formatCents(totals.balanceCents)}</span>
            </div>
          ) : null}
        </div>

        <Rule />

        {/* --------------------------------------------------------- footer */}
        <div className="rc-center rc-footer">
          <div className="rc-thanks">Thank you!</div>
          <Barcode value={String(invoice.number)} height={38} width={1.4} />
        </div>
      </div>
    </>
  );
}

function Rule() {
  return <div aria-hidden className="rc-rule" />;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rc-meta-row">
      <span className="rc-dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rc-total-row">
      <span className="rc-dim">{label}</span>
      <span className="rc-amount">{value}</span>
    </div>
  );
}

/**
 * Change is a fact about the drawer at the moment of the sale, not a column on
 * the invoice, so the register passes it here. A reprint days later simply
 * arrives without it and prints no change line — which is the honest outcome.
 * Anything malformed is dropped rather than trusted.
 */
function readChange(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;
  const cents = Number.parseInt(value, 10);
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) return null;
  return cents;
}

/** Receipt timestamps read in the shop's own timezone, not the server's. */
function formatStamp(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(value);
  } catch {
    // A bad timezone string in settings must not blank the receipt.
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(value);
  }
}

const RECEIPT_CSS = `
.receipt-sheet {
  --rc-ink: #000;
  width: 80mm;
  margin: 1.5rem auto 3rem;
  padding: 6mm 5mm 8mm;
  background: #fff;
  color: var(--rc-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.45;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 8px 24px rgb(0 0 0 / 0.08);
}
.rc-center { text-align: center; }
.rc-shop {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.rc-dim { color: #444; }
.rc-rule {
  border-top: 1px dashed #999;
  margin: 8px 0;
}
.rc-meta-row, .rc-total-row, .rc-meta { display: block; }
.rc-meta-row, .rc-total-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.rc-meta-row > span:last-child { font-weight: 600; text-align: right; }
.rc-line { margin-bottom: 6px; }
.rc-line-name { font-weight: 700; word-break: break-word; }
.rc-line-figures {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-left: 8px;
}
.rc-amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rc-totals > * + * { margin-top: 3px; }
.rc-ref { padding-left: 8px; font-size: 10.5px; }
.rc-grand, .rc-change {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid var(--rc-ink);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.rc-footer { margin-top: 12px; }
.rc-thanks {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}
.rc-footer svg { max-width: 100%; height: auto; }

@page { size: 80mm auto; margin: 3mm; }

@media print {
  .receipt-sheet {
    width: auto;
    margin: 0;
    padding: 0;
    box-shadow: none;
    font-size: 11px;
  }
}
`;
