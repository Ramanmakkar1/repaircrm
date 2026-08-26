import * as React from "react";

import { formatCents } from "@/lib/money";
import { Barcode } from "./barcode";
import { PrintToolbar } from "./print-toolbar";

/**
 * The printable sheet behind /print/invoices/[id] and /print/estimates/[id].
 *
 * Deliberately styled with fixed neutral/black colours rather than the app's
 * theme tokens: this markup ends up on paper (or in a browser "Save as PDF"),
 * where a dark-mode palette would come out as a black rectangle. Everything
 * outside `.no-print` is designed to survive the print stylesheet.
 */

export type PrintParty = {
  name: string;
  /** Address/contact lines, already filtered of empties. */
  lines: string[];
};

export type PrintMetaRow = { label: string; value: string };

export type PrintLine = {
  id: string;
  description: string;
  serial?: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type PrintTotalRow = {
  label: string;
  value: string;
  strong?: boolean;
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
  billTo,
  meta,
  lines,
  showSerial = false,
  totals,
  payments,
  notes,
  signature,
  signatureCaption,
  watermark,
  backHref,
  backLabel,
  footer,
}: {
  docLabel: string;
  docNote?: string;
  number: number;
  shop: PrintParty;
  billTo: PrintParty;
  meta: PrintMetaRow[];
  lines: PrintLine[];
  showSerial?: boolean;
  totals: PrintTotalRow[];
  payments?: PrintPayment[];
  notes?: string | null;
  signature?: string | null;
  signatureCaption?: string;
  /** e.g. "PAID" — drawn diagonally across the sheet. */
  watermark?: string | null;
  backHref: string;
  backLabel: string;
  footer: string;
}) {
  const barcodeValue = `${docLabel[0]}${number}`;

  return (
    <>
      <PrintToolbar backHref={backHref} backLabel={backLabel} />

      <div className="print-sheet relative mx-auto w-full max-w-[8.5in] bg-white px-8 pb-10 text-[12px] leading-relaxed text-neutral-900 print:px-0">
        {watermark ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
          >
            <span className="watermark -rotate-[24deg] select-none text-[110px] font-black uppercase tracking-[0.15em] text-neutral-900/[0.07]">
              {watermark}
            </span>
          </div>
        ) : null}

        <div className="relative z-[1]">
          {/* ---------------------------------------------------- masthead --- */}
          <header className="flex items-start justify-between gap-8 border-b-2 border-neutral-900 pb-5">
            <div>
              <h1 className="text-[19px] font-bold tracking-tight text-neutral-900">
                {shop.name}
              </h1>
              <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-600">
                {shop.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[26px] font-bold uppercase tracking-[0.18em] text-neutral-900">
                {docLabel}
              </div>
              <div className="mt-0.5 font-mono text-[15px] text-neutral-700">
                #{number}
              </div>
              {docNote ? (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {docNote}
                </div>
              ) : null}
              <div className="mt-2.5 flex justify-end">
                <Barcode value={barcodeValue} height={38} width={1.5} />
              </div>
            </div>
          </header>

          {/* ------------------------------------------- bill-to and meta --- */}
          <section className="mt-6 flex items-start justify-between gap-10">
            <div className="min-w-0">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Bill To
              </h2>
              <div className="mt-1.5">
                <div className="text-[13px] font-semibold text-neutral-900">
                  {billTo.name}
                </div>
                <div className="mt-0.5 space-y-0.5 text-[11px] text-neutral-600">
                  {billTo.lines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </div>

            <table className="shrink-0 border-collapse text-[11px]">
              <tbody>
                {meta.map((row) => (
                  <tr key={row.label}>
                    <th className="border border-neutral-300 bg-neutral-100 px-3 py-1 text-left font-semibold uppercase tracking-wider text-neutral-600">
                      {row.label}
                    </th>
                    <td className="border border-neutral-300 px-3 py-1 text-right font-mono text-neutral-900">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* --------------------------------------------------- line items -- */}
          <section className="mt-7">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white">
                  <Th className="text-left">Activity</Th>
                  {showSerial ? <Th className="w-[110px] text-left">Serial</Th> : null}
                  <Th className="w-[56px] text-right">Qty</Th>
                  <Th className="w-[90px] text-right">Rate</Th>
                  <Th className="w-[100px] text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr
                    key={line.id}
                    className={index % 2 === 1 ? "bg-neutral-50" : undefined}
                  >
                    <Td className="text-left">{line.description}</Td>
                    {showSerial ? (
                      <Td className="text-left font-mono text-[10px] text-neutral-600">
                        {line.serial || "—"}
                      </Td>
                    ) : null}
                    <Td className="text-right font-mono">{line.quantity}</Td>
                    <Td className="text-right font-mono">
                      {formatCents(line.unitPriceCents)}
                    </Td>
                    <Td className="text-right font-mono">
                      {formatCents(line.quantity * line.unitPriceCents)}
                    </Td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr>
                    <Td
                      className="text-center text-neutral-500"
                      colSpan={showSerial ? 5 : 4}
                    >
                      No line items.
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {/* ------------------------------------------------------ totals --- */}
          <section className="mt-5 flex justify-end break-inside-avoid">
            <table className="w-[300px] border-collapse text-[12px]">
              <tbody>
                {totals.map((row) => (
                  <tr key={row.label}>
                    <td
                      className={[
                        "py-1 pr-4 text-right",
                        row.strong ? "font-semibold text-neutral-900" : "text-neutral-600",
                        row.emphasis
                          ? "border-t-2 border-neutral-900 pt-2 text-[14px] font-bold uppercase tracking-wide"
                          : "",
                      ].join(" ")}
                    >
                      {row.label}
                    </td>
                    <td
                      className={[
                        "py-1 text-right font-mono",
                        row.strong ? "font-semibold text-neutral-900" : "text-neutral-800",
                        row.emphasis
                          ? "border-t-2 border-neutral-900 pt-2 text-[16px] font-bold"
                          : "",
                      ].join(" ")}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ---------------------------------------------------- payments --- */}
          {payments && payments.length > 0 ? (
            <section className="mt-7 break-inside-avoid">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Payments received
              </h2>
              <table className="mt-1.5 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-neutral-300 text-neutral-600">
                    <th className="py-1 text-left font-semibold">Date</th>
                    <th className="py-1 text-left font-semibold">Method</th>
                    <th className="py-1 text-left font-semibold">Reference</th>
                    <th className="py-1 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-neutral-200">
                      <td className="py-1 font-mono">{payment.date}</td>
                      <td className="py-1">{payment.method}</td>
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

          {/* ------------------------------------------------------- notes --- */}
          {notes ? (
            <section className="mt-7 break-inside-avoid">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Notes
              </h2>
              <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-neutral-700">
                {notes}
              </p>
            </section>
          ) : null}

          {/* --------------------------------------------------- signature --- */}
          {signature ? (
            <section className="mt-8 break-inside-avoid">
              <div className="w-[280px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signature}
                  alt="Customer signature"
                  className="h-[70px] w-full object-contain object-left"
                />
                <div className="mt-1 border-t border-neutral-400 pt-1 text-[10px] uppercase tracking-wider text-neutral-500">
                  {signatureCaption ?? "Customer signature"}
                </div>
              </div>
            </section>
          ) : null}

          <footer className="mt-10 border-t border-neutral-300 pt-3 text-center text-[11px] text-neutral-600">
            {footer}
          </footer>
        </div>
      </div>
    </>
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
