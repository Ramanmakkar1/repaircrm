import * as React from "react";

import { formatCents } from "@/lib/money";
import { warrantyLabel } from "@/lib/warranty";
import {
  Masthead,
  MetaTable,
  PartyBlock,
  SectionHead,
  SheetFooter,
  SignatureBlock,
  Stamp,
  type PrintMetaRow,
  type PrintParty,
} from "./print-chrome";
import { PrintToolbar } from "./print-toolbar";

/**
 * The flagship sheet: /print/invoices/[id], /print/estimates/[id] and the
 * customer's own copy at /portal/invoices/[id]/print all render this one
 * component, so a customer can never receive a document that disagrees with the
 * one the shop filed.
 *
 * Deliberately styled with the fixed `--rf-*` palette from print-styles.ts
 * rather than the app's theme tokens: this markup ends up on paper (or in a
 * browser "Save as PDF"), where a dark-mode palette would come out as a black
 * rectangle. Everything outside `.no-print` is designed to survive the print
 * stylesheet.
 *
 * The prop surface is additive — every prop the previous version accepted still
 * means what it meant — because one of the three callers lives behind a
 * different auth boundary and is not part of this change.
 */

export type { PrintParty, PrintMetaRow };

export type PrintLine = {
  id: string;
  description: string;
  serial?: string | null;
  quantity: number;
  unitPriceCents: number;
  /** Drives the taxable marker; omit to leave every line unmarked. */
  taxable?: boolean | null;
  /** Warranty sold with this line, in days. Printed under the description. */
  warrantyDays?: number | null;
};

export type PrintTotalRow = {
  label: string;
  value: string;
  /** Rule above and heavier ink — the "Total" line. */
  strong?: boolean;
  /** Promoted out of the table into the accent balance panel. */
  emphasis?: boolean;
};

export type PrintPayment = {
  id: string;
  date: string;
  method: string;
  reference: string | null;
  amountCents: number;
};

export function PrintSheet({
  docLabel,
  docNote,
  number,
  shop,
  logoUrl,
  billTo,
  billToLabel = "Bill to",
  meta,
  callout,
  lines,
  showSerial = false,
  itemsLabel = "Description",
  totals,
  payments,
  paymentsLabel = "Payments received",
  notes,
  signature,
  signatureCaption,
  signaturePlaceholder = false,
  signatureNote,
  watermark,
  watermarkTone = "accent",
  backHref,
  backLabel,
  footer,
  footerContact,
  barcodeValue,
}: {
  docLabel: string;
  docNote?: string;
  number: number;
  shop: PrintParty;
  /** Shop logo; a monogram tile stands in when it is absent. */
  logoUrl?: string | null;
  billTo: PrintParty;
  billToLabel?: string;
  meta: PrintMetaRow[];
  /** The tinted band under the meta row — "not a bill", validity, etc. */
  callout?: { title: string; body: string } | null;
  lines: PrintLine[];
  showSerial?: boolean;
  itemsLabel?: string;
  totals: PrintTotalRow[];
  payments?: PrintPayment[];
  paymentsLabel?: string;
  notes?: string | null;
  signature?: string | null;
  signatureCaption?: string;
  /** Draw an empty ruled signature line when `signature` is absent. */
  signaturePlaceholder?: boolean;
  signatureNote?: string;
  /** e.g. "PAID" — drawn diagonally across the sheet. */
  watermark?: string | null;
  watermarkTone?: "accent" | "alarm";
  backHref: string;
  backLabel: string;
  footer: string;
  footerContact?: string | null;
  barcodeValue?: string;
}) {
  const code = barcodeValue ?? `${docLabel[0] ?? "D"}${number}`;

  // A taxable marker is only information when the document actually splits into
  // taxed and untaxed lines; on a uniformly taxable invoice it is just noise.
  const marked = lines.filter((line) => line.taxable === true);
  const showTaxMarks = marked.length > 0 && marked.length < lines.length;

  // The emphasis row is a panel, not a table row — pulling it out here keeps the
  // caller's `totals` array a flat, obvious list.
  const tableRows = totals.filter((row) => !row.emphasis);
  const panelRows = totals.filter((row) => row.emphasis);

  return (
    <>
      <PrintToolbar
        backHref={backHref}
        backLabel={backLabel}
        title={`${docLabel} #${number}`}
      />

      <article className="rf-sheet">
        {watermark ? <Stamp label={watermark} tone={watermarkTone} /> : null}

        <div className="rf-body">
          <Masthead
            shop={shop}
            logoUrl={logoUrl}
            docLabel={docLabel}
            docNumber={`No. ${number}`}
            note={docNote}
          />

          <section className="rf-cols">
            <PartyBlock label={billToLabel} party={billTo} />
            <MetaTable rows={meta} />
          </section>

          {callout ? (
            <aside className="rf-callout">
              <strong className="rf-callout-title">{callout.title}</strong>
              {callout.body}
            </aside>
          ) : null}

          {/* ------------------------------------------------- line items --- */}
          <section className="rf-section">
            <table className="rf-items">
              <thead>
                <tr>
                  <th scope="col">{itemsLabel}</th>
                  <th scope="col" style={{ width: "0.7in", textAlign: "right" }}>
                    Qty
                  </th>
                  <th scope="col" style={{ width: "1.15in", textAlign: "right" }}>
                    Rate
                  </th>
                  <th scope="col" style={{ width: "1.25in", textAlign: "right" }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <div className="rf-item-desc">
                        {line.description}
                        {showTaxMarks && line.taxable ? (
                          <span className="rf-mark-tax">†</span>
                        ) : null}
                      </div>
                      {showSerial && line.serial ? (
                        <div className="rf-item-sub">S/N {line.serial}</div>
                      ) : null}
                      {line.warrantyDays ? (
                        <div className="rf-item-sub">
                          Warranty: {warrantyLabel(line.warrantyDays)}
                        </div>
                      ) : null}
                    </td>
                    <td className="rf-num">{line.quantity}</td>
                    <td className="rf-num">{formatCents(line.unitPriceCents)}</td>
                    <td className="rf-num">
                      {formatCents(line.quantity * line.unitPriceCents)}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr>
                    <td className="rf-empty" colSpan={4}>
                      No line items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {showTaxMarks ? (
              <div className="rf-footnote">† Sales tax applies to this item.</div>
            ) : null}
          </section>

          {/* ----------------------------------------------------- totals --- */}
          <section className="rf-totals-wrap">
            <div className="rf-totals-panel">
              {tableRows.length > 0 ? (
                <table className="rf-totals">
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.label} className={row.strong ? "is-strong" : undefined}>
                        <td className="rf-t-label">{row.label}</td>
                        <td className="rf-t-value">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {panelRows.map((row) => (
                <div key={row.label} className="rf-balance">
                  <span className="rf-balance-label">{row.label}</span>
                  <span className="rf-balance-value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* --------------------------------------------------- payments --- */}
          {payments && payments.length > 0 ? (
            <section className="rf-section rf-avoid">
              <SectionHead title={paymentsLabel} />
              <table className="rf-mini">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
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
                        {payment.date}
                      </td>
                      <td>{payment.method}</td>
                      <td className="rf-muted">{payment.reference || "—"}</td>
                      <td className="rf-num">{formatCents(payment.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* ------------------------------------------------------ notes --- */}
          {notes ? (
            <section className="rf-section rf-avoid">
              <SectionHead title="Notes" />
              <p className="rf-note" style={{ marginTop: 0 }}>
                {notes}
              </p>
            </section>
          ) : null}

          {/* -------------------------------------------------- signature --- */}
          {signature || signaturePlaceholder ? (
            <section className="rf-avoid">
              <div className="rf-signs">
                <SignatureBlock
                  caption={signatureCaption ?? "Customer signature"}
                  dataUrl={signature}
                />
                {signaturePlaceholder && !signature ? (
                  <SignatureBlock caption="Date" width="1.6in" />
                ) : null}
              </div>
              {signatureNote ? <p className="rf-note">{signatureNote}</p> : null}
            </section>
          ) : null}

          <SheetFooter barcode={code} message={footer} contact={footerContact} />
        </div>
      </article>
    </>
  );
}
