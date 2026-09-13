import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Barcode } from "@/components/billing/barcode";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import { RECEIPT_CSS } from "@/components/billing/receipt-styles";
import { METHOD_LABELS, type TenderMethod } from "@/components/pos/types";

/**
 * The deposit slip.
 *
 * Same 80mm roll, same ink, same type as the sale receipt (they share
 * components/billing/receipt-styles.ts) — because to the customer these are the
 * same piece of paper from the same shop, and only the words differ.
 *
 * What it has to say is narrower than a sale: no line items, no tax, no
 * balance. Just how much was left, on which ticket, and the one sentence that
 * stops the phone call — that this money comes off the final bill.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Deposit receipt · RepairPilot" };

export default async function DepositReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [deposit, shop] = await Promise.all([
    // Scoped: a deposit id from another tenant 404s rather than printing.
    db.deposit.findFirst({
      where: { id, shopId },
      select: {
        id: true,
        amountCents: true,
        method: true,
        reference: true,
        createdAt: true,
        refundedAt: true,
        appliedInvoiceId: true,
        takenBy: { select: { name: true } },
        customer: {
          select: { firstName: true, lastName: true, businessName: true },
        },
        ticket: { select: { number: true, subject: true } },
        appliedInvoice: { select: { number: true } },
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

  if (!deposit || !shop) notFound();

  const customerName =
    deposit.customer.businessName ||
    `${deposit.customer.firstName} ${deposit.customer.lastName}`.trim();

  const addressLines = [
    shop.address1,
    shop.address2,
    [[shop.city, shop.state].filter(Boolean).join(", "), shop.postalCode]
      .filter(Boolean)
      .join(" "),
    shop.phone,
  ].filter((line): line is string => Boolean(line && String(line).trim()));

  const standing = deposit.refundedAt
    ? "This deposit has been refunded."
    : deposit.appliedInvoice
      ? `Applied to invoice #${deposit.appliedInvoice.number}.`
      : "Held on your account — it comes off your final bill.";

  return (
    <>
      <style>{RECEIPT_CSS}</style>
      <PrintToolbar
        backHref="/tickets"
        backLabel="Back to tickets"
        title={`Deposit · ticket #${deposit.ticket.number}`}
      />

      <div className="receipt-sheet">
        <div className="rc-center">
          <div className="rc-shop">{shop.name}</div>
          {addressLines.map((line) => (
            <div key={line} className="rc-dim">
              {line}
            </div>
          ))}
        </div>

        <div aria-hidden className="rc-rule" />

        <div className="rc-center rc-thanks">Deposit receipt</div>

        <div aria-hidden className="rc-rule" />

        <div className="rc-meta">
          <MetaRow label="Ticket" value={`#${deposit.ticket.number}`} />
          <MetaRow
            label="Date"
            value={formatStamp(deposit.createdAt, shop.timezone)}
          />
          <MetaRow label="Customer" value={customerName} />
          <MetaRow
            label="Method"
            value={
              METHOD_LABELS[deposit.method as TenderMethod] ?? deposit.method
            }
          />
          {deposit.takenBy?.name ? (
            <MetaRow label="Taken by" value={deposit.takenBy.name} />
          ) : null}
        </div>

        <div aria-hidden className="rc-rule" />

        <div className="rc-lines">
          <div className="rc-line">
            <div className="rc-line-name">{deposit.ticket.subject}</div>
            {deposit.reference ? (
              <div className="rc-dim rc-ref">{deposit.reference}</div>
            ) : null}
          </div>
        </div>

        <div className="rc-totals">
          <div className="rc-grand">
            <span>DEPOSIT</span>
            <span>{formatCents(deposit.amountCents)}</span>
          </div>
        </div>

        <div aria-hidden className="rc-rule" />

        <div className="rc-center rc-footer">
          <div className="rc-policy">{standing}</div>
          <Barcode value={String(deposit.ticket.number)} height={36} width={1.4} />
        </div>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rc-meta-row">
      <span className="rc-dim">{label}</span>
      <span>{value}</span>
    </div>
  );
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
