import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPrintShop } from "@/components/billing/print-queries";
import { invoiceSheetProps } from "@/components/billing/print-mappers";
import { PrintSheet } from "@/components/billing/print-sheet";

export const metadata: Metadata = { title: "Invoice · RepairFlow" };

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
      include: {
        customer: true,
        taxRate: { select: { name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    }),
    loadPrintShop(shopId),
  ]);
  if (!invoice || !shop) notFound();

  // Every prop this sheet takes is derived in `invoiceSheetProps`, which the
  // batch page at /print/invoices also calls — the two documents cannot drift.
  return <PrintSheet {...invoiceSheetProps(invoice, shop)} />;
}
