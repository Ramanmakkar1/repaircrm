import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatDate } from "@/components/billing/format";
import { addressLines, loadPrintShop } from "@/components/billing/print-queries";
import {
  PrintSheet,
  type PrintLine,
  type PrintMetaRow,
  type PrintTotalRow,
} from "@/components/billing/print-sheet";
import { PO_STATUS_META, asPoStatus, poTotals } from "@/components/inventory/purchasing";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Purchase order · RepairFlow" };

/**
 * The vendor-facing sheet.
 *
 * Rendered with the same `PrintSheet` as invoices and estimates, so a shop's
 * paperwork looks like one house even when half of it goes to customers and
 * half to suppliers. The only re-labelling is "Order to" instead of "Bill to"
 * and cost instead of price — a PO is the shop buying, not selling, so there is
 * no sales tax line: the vendor's own invoice carries whatever tax applies.
 */
export default async function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [order, shop] = await Promise.all([
    db.purchaseOrder.findFirst({
      where: { id, shopId },
      select: {
        id: true,
        number: true,
        status: true,
        notes: true,
        shippingCents: true,
        createdAt: true,
        orderedAt: true,
        expectedAt: true,
        vendor: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
            accountNumber: true,
          },
        },
        lines: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitCostCents: true,
            product: { select: { vendorSku: true, sku: true } },
          },
        },
      },
    }),
    loadPrintShop(shopId),
  ]);
  if (!order || !shop) notFound();

  const totals = poTotals(order.lines, order.shippingCents);
  const status = asPoStatus(order.status);

  // The vendor's address is one free-text block on the record, so it prints as
  // typed rather than being squeezed into the structured address helper.
  const vendorLines = [
    ...(order.vendor.address ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    ...addressLines({ phone: order.vendor.phone, email: order.vendor.email }),
  ];

  const lines: PrintLine[] = order.lines.map((line) => {
    const sku = line.product?.vendorSku ?? line.product?.sku ?? null;
    return {
      id: line.id,
      description: sku ? `${line.description} · SKU ${sku}` : line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitCostCents,
    };
  });

  const meta: PrintMetaRow[] = [
    { label: "PO #", value: String(order.number) },
    { label: "Raised", value: formatDate(order.createdAt) },
    {
      label: "Placed",
      value: order.orderedAt ? formatDate(order.orderedAt) : "Not yet placed",
    },
    {
      label: "Needed by",
      value: order.expectedAt ? formatDate(order.expectedAt) : "No date given",
    },
    ...(order.vendor.accountNumber
      ? [{ label: "Account", value: order.vendor.accountNumber }]
      : []),
  ];

  const totalRows: PrintTotalRow[] = [
    { label: "Subtotal", value: formatCents(totals.subtotalCents) },
    { label: "Shipping", value: formatCents(totals.shippingCents) },
    { label: "Total", value: formatCents(totals.totalCents), strong: true },
    { label: "Order total", value: formatCents(totals.totalCents), emphasis: true },
  ];

  return (
    <PrintSheet
      docLabel="Purchase Order"
      docNote={status === "DRAFT" ? "Draft — not yet placed" : undefined}
      number={order.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      logoUrl={shop.logoUrl}
      billTo={{ name: order.vendor.name, lines: vendorLines }}
      billToLabel="Order to"
      meta={meta}
      itemsLabel="Item"
      lines={lines}
      totals={totalRows}
      notes={order.notes}
      watermark={status === "CANCELED" ? "CANCELED" : null}
      watermarkTone="alarm"
      backHref={`/inventory/purchase-orders/${order.id}`}
      backLabel="Back to the order"
      footer={`Purchase order #${order.number} — ${PO_STATUS_META[status].label}. Please quote this number on your invoice.`}
      footerContact={[shop.phone, shop.email].filter(Boolean).join("  ·  ") || null}
      barcodeValue={`PO${order.number}`}
    />
  );
}
