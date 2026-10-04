import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPrintShop } from "@/components/billing/print-queries";
import { PRINTABLE_INVOICE_INCLUDE, invoiceIsPayable, invoiceSheetProps, type PrintableInvoice } from "@/components/billing/print-mappers";
import { invoiceTokenPath, portalUrl } from "@/lib/comms";
import QRCode from "qrcode";
import { PrintSheet } from "@/components/billing/print-sheet";

export const metadata: Metadata = { title: "Invoice · Repairs helper" };

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [invoice, shop] = await Promise.all([
    db.invoice.findFirst({
      where: { id, shopId },
      include: PRINTABLE_INVOICE_INCLUDE,
    }),
    loadPrintShop(shopId),
  ]);
  if (!invoice || !shop) notFound();

  // Every prop this sheet takes is derived in `invoiceSheetProps`, which the
  // batch page at /print/invoices also calls — the two documents cannot drift.
  return <PrintSheet {...invoiceSheetProps(invoice, shop)} payOnline={await payOnlineFor(invoice)} />;
}

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
