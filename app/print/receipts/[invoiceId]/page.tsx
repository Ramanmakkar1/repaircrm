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
 * What it does share is the family's ink: the same near-black, the same tabular
 * figures, the same "big number for the thing that matters" hierarchy — sized
 * for a 203dpi thermal head rather than a laser printer, which is why the type
 * is a shade heavier and the rules are dashed rather than hairline.
 *
 * The layout's `@page { margin: 0.5in }` is overridden below; because this style
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

  // What the customer physically handed over: what was applied to the invoice
  // plus whatever came back out of the drawer.
  const tenderedCents = totals.paidCents + (changeDueCents ?? 0);

  return (
    <>
      <style>{RECEIPT_CSS}</style>
      <PrintToolbar
        backHref="/pos"
        backLabel="Back to POS"
        title={`Receipt #${invoice.number}`}
      />

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
        <div className="rc-lines">
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
            <>
              <TotalRow label="Tendered" value={formatCents(tenderedCents)} />
              <div className="rc-change">
                <span>CHANGE</span>
                <span>{formatCents(changeDueCents)}</span>
              </div>
            </>
          ) : null}

          {totals.balanceCents > 0 ? (
            <div className="rc-grand rc-owing">
              <span>BALANCE DUE</span>
              <span>{formatCents(totals.balanceCents)}</span>
            </div>
          ) : null}
        </div>

        <Rule />

        {/* --------------------------------------------------------- footer */}
        <div className="rc-center rc-footer">
          <div className="rc-thanks">Thank you!</div>
          <div className="rc-policy">
            Keep this receipt — it is your proof of purchase and warranty record.
          </div>
          <Barcode value={String(invoice.number)} height={36} width={1.4} />
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
  --rc-dim: #3f3f3f;
  width: 80mm;
  margin: 28px auto 56px;
  padding: 7mm 6mm 9mm;
  background: #fff;
  color: var(--rc-ink);
  font-family: var(--rf-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  box-shadow:
    0 0 0 1px rgb(16 20 24 / 0.07),
    0 1px 2px rgb(16 20 24 / 0.1),
    0 20px 44px -14px rgb(16 20 24 / 0.28);
}
.rc-center { text-align: center; }
.rc-shop {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.25;
  margin-bottom: 3px;
}
.rc-dim { color: var(--rc-dim); }
.rc-rule {
  border-top: 1px dashed #8a8a8a;
  margin: 9px 0;
}
.rc-meta-row, .rc-total-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.rc-meta > * + * { margin-top: 1px; }
.rc-meta-row > span:last-child { font-weight: 700; text-align: right; }
.rc-lines > * + * { margin-top: 7px; }
.rc-line-name {
  font-weight: 700;
  letter-spacing: -0.01em;
  word-break: break-word;
}
.rc-line-figures {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-left: 10px;
}
.rc-amount { white-space: nowrap; }
.rc-totals > * + * { margin-top: 3px; }
.rc-ref { padding-left: 10px; font-size: 10px; }
.rc-grand, .rc-change {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--rc-ink);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.rc-change { font-size: 14px; }
.rc-owing { border-top-width: 2px; }
.rc-footer { margin-top: 14px; }
.rc-thanks {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rc-policy {
  margin: 4px 0 9px;
  font-size: 9.5px;
  line-height: 1.45;
  color: var(--rc-dim);
}
.rc-footer svg { max-width: 100%; height: auto; margin: 0 auto; }

/* A receipt is roll stock, not a page: fixed width, unlimited length. */
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
