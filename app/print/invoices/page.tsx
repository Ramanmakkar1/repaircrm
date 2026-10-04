import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PRINTABLE_INVOICE_INCLUDE, invoiceIsPayable, invoiceSheetProps, type PrintableInvoice } from "@/components/billing/print-mappers";
import { invoiceTokenPath, portalUrl } from "@/lib/comms";
import QRCode from "qrcode";
import { loadPrintShop } from "@/components/billing/print-queries";
import { PrintSheet } from "@/components/billing/print-sheet";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import { requireUser } from "@/lib/auth";
import { BULK_LIMIT } from "@/lib/bulk";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Invoices · Repairs helper" };

/**
 * A run of invoices as one print job — where the invoice list's bulk "Print"
 * lands.
 *
 * Same sheet and the same `invoiceSheetProps` mapper as /print/invoices/[id];
 * only the chrome differs (one toolbar for the run instead of one per
 * document), and that is the single prop overridden below. Scoped by the
 * session's `shopId`, so ids in the query string are guesses that only resolve
 * against the caller's own invoices, and capped at `BULK_LIMIT`.
 *
 * Ordered by invoice number, which is the order a shop files them.
 */
export default async function InvoiceBatchPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { shopId } = await requireUser();
  const { ids: rawIds } = await searchParams;

  const ids = parseIds(rawIds);
  if (ids.length === 0) notFound();

  const [invoices, shop] = await Promise.all([
    db.invoice.findMany({
      where: { id: { in: ids }, shopId },
      orderBy: { number: "asc" },
      include: PRINTABLE_INVOICE_INCLUDE,
    }),
    loadPrintShop(shopId),
  ]);
  if (invoices.length === 0 || !shop) notFound();
  const payOnline = await Promise.all(invoices.map(payOnlineFor));

  return (
    <>
      <style>{BATCH_CSS}</style>

      <PrintToolbar
        backHref="/invoices"
        backLabel="Back to invoices"
        title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
      />

      {invoices.map((invoice, index) => (
        <div key={invoice.id} className="rf-batch-item">
          {/* One toolbar for the run — each sheet's own is suppressed. */}
          <PrintSheet {...invoiceSheetProps(invoice, shop)} payOnline={payOnline[index]} chrome={false} />
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

/** `?ids=a,b,c`, de-duplicated and bounded. Anything malformed is dropped. */
function parseIds(raw: string | string[] | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = new Set<string>();
  for (const part of joined.split(",")) {
    const id = part.trim();
    if (id && id.length <= 64) ids.add(id);
  }
  return [...ids].slice(0, BULK_LIMIT);
}

const BATCH_CSS = `
@media print {
  .rf-batch-item { break-after: page; page-break-after: always; }
  .rf-batch-item:last-child { break-after: auto; page-break-after: auto; }
}
`;

/** An unpaid invoice's pay-online link and its QR, printed beside the balance. */
async function payOnlineFor(invoice: PrintableInvoice): Promise<{ url: string; qrDataUrl: string } | null> {
  if (!invoiceIsPayable(invoice)) return null;
  const url = portalUrl(invoiceTokenPath(invoice.publicToken));
  try {
    return { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 0, width: 240 }) };
  } catch {
    // A QR that cannot be drawn must not cost the customer their invoice.
    return null;
  }
}
