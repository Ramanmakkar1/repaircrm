import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { formatDate, formatDateLong } from "@/components/billing/format";
import { addressLines, loadPrintShop } from "@/components/billing/print-queries";
import {
  PrintSheet,
  type PrintTotalRow,
} from "@/components/billing/print-sheet";

export const metadata: Metadata = { title: "Estimate · RepairFlow" };

export default async function EstimatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [estimate, shop] = await Promise.all([
    db.estimate.findFirst({
      where: { id, shopId },
      include: {
        customer: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
    }),
    loadPrintShop(shopId),
  ]);
  if (!estimate || !shop) notFound();

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const customerName =
    estimate.customer.businessName ||
    `${estimate.customer.firstName} ${estimate.customer.lastName}`;

  const approved = Boolean(estimate.approvedAt);
  const declined = estimate.status === "DECLINED";
  const expired =
    !approved &&
    !declined &&
    Boolean(estimate.expiresAt && estimate.expiresAt.getTime() < Date.now());

  const totalRows: PrintTotalRow[] = [
    { label: "Subtotal", value: formatCents(totals.subtotalCents) },
    {
      label: `Sales tax (${formatBps(estimate.taxRateBps)})`,
      value: formatCents(totals.taxCents),
    },
    {
      label: "Estimated total",
      value: formatCents(totals.totalCents),
      emphasis: true,
    },
  ];

  const validity = estimate.expiresAt
    ? `Prices and parts availability are held until ${formatDateLong(estimate.expiresAt)}.`
    : "Prices and parts availability are subject to change until this estimate is approved.";

  const contact = [shop.phone, shop.email].filter(Boolean).join("  ·  ");

  return (
    <PrintSheet
      docLabel="Estimate"
      // Stated plainly, twice, so nobody in accounts payable pays against a quote.
      docNote={
        declined ? "Declined" : expired ? "Expired — please request a new quote" : "Not a bill"
      }
      number={estimate.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      logoUrl={shop.logoUrl}
      billTo={{ name: customerName, lines: addressLines(estimate.customer) }}
      billToLabel="Prepared for"
      meta={[
        { label: "Estimate #", value: String(estimate.number) },
        { label: "Issue date", value: formatDate(estimate.createdAt) },
        {
          label: "Valid until",
          value: estimate.expiresAt ? formatDate(estimate.expiresAt) : "—",
        },
        {
          label: "Status",
          value: approved
            ? "Approved"
            : declined
              ? "Declined"
              : expired
                ? "Expired"
                : "Awaiting approval",
        },
      ]}
      callout={{
        title: "Estimate — not a bill · no payment due",
        body: `${validity} Nothing is charged and no work begins until you approve this estimate.`,
      }}
      lines={estimate.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxable: line.taxable,
      }))}
      totals={totalRows}
      notes={estimate.notes}
      signature={estimate.approvalSignatureDataUrl}
      signatureCaption={
        estimate.approvedAt
          ? `Approved by ${customerName} · ${formatDate(estimate.approvedAt)}`
          : "Customer approval signature"
      }
      // An unsigned estimate prints the box it wants signed, not a blank gap.
      signaturePlaceholder={!approved && !declined}
      signatureNote={
        approved || declined
          ? undefined
          : "Approve online from the secure link in your estimate email, or sign and date above and return this page to the shop."
      }
      watermark={
        declined
          ? "Declined"
          : estimate.status === "CONVERTED"
            ? "Invoiced"
            : approved
              ? "Approved"
              : expired
                ? "Expired"
                : null
      }
      watermarkTone={declined || expired ? "alarm" : "accent"}
      backHref={`/estimates/${estimate.id}`}
      backLabel={`Back to estimate #${estimate.number}`}
      footer="Approve it and we'll get started."
      footerContact={
        contact
          ? `Questions? ${shop.name}  ·  ${contact}`
          : `Questions? Contact ${shop.name}.`
      }
    />
  );
}
