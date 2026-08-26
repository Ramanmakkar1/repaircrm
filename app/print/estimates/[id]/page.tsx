import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { formatDate } from "@/components/billing/format";
import { loadShopHeader } from "@/components/billing/queries";
import {
  PrintSheet,
  type PrintTotalRow,
} from "@/components/billing/print-sheet";

function addressLines(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
}): string[] {
  const cityLine = [parts.city, parts.state].filter(Boolean).join(", ");
  const locality = [cityLine, parts.postalCode].filter(Boolean).join(" ");
  return [
    parts.address1,
    parts.address2,
    locality,
    parts.phone,
    parts.email,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

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
    loadShopHeader(shopId),
  ]);
  if (!estimate || !shop) notFound();

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const customerName =
    estimate.customer.businessName ||
    `${estimate.customer.firstName} ${estimate.customer.lastName}`;

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

  return (
    <PrintSheet
      docLabel="ESTIMATE"
      // Stated plainly so nobody in accounts payable pays against a quote.
      docNote="Not a bill — no payment due"
      number={estimate.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      billTo={{ name: customerName, lines: addressLines(estimate.customer) }}
      meta={[
        { label: "Estimate date", value: formatDate(estimate.createdAt) },
        { label: "Estimate #", value: String(estimate.number) },
        {
          label: "Valid until",
          value: estimate.expiresAt ? formatDate(estimate.expiresAt) : "—",
        },
      ]}
      lines={estimate.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      }))}
      totals={totalRows}
      notes={estimate.notes}
      signature={estimate.approvalSignatureDataUrl}
      signatureCaption={
        estimate.approvedAt
          ? `Approved by ${customerName} on ${formatDate(estimate.approvedAt)}`
          : `Approved by ${customerName}`
      }
      watermark={
        estimate.status === "DECLINED"
          ? "Declined"
          : estimate.status === "APPROVED"
            ? "Approved"
            : estimate.status === "CONVERTED"
              ? "Invoiced"
              : null
      }
      backHref={`/estimates/${estimate.id}`}
      backLabel={`Back to estimate #${estimate.number}`}
      footer="This estimate is not a bill. Approve it and we'll get started — prices hold until the date above."
    />
  );
}
