import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "@/components/billing/document-form";
import { toDateInputValue } from "@/components/billing/format";
import { loadDocumentFormData } from "@/components/billing/queries";
import { updateEstimateAction } from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: estimate
      ? `Edit estimate #${estimate.number} · RepairFlow`
      : "Edit estimate · RepairFlow",
  };
}

export default async function EditEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) notFound();

  // Once converted, the invoice is the live document — edit that instead.
  if (estimate.status === "CONVERTED") {
    redirect(`/estimates/${estimate.id}`);
  }

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  return (
    <div className="flex flex-col">
      <PageHeader
        icon={ICONS.estimate}
        title={`Edit estimate #${estimate.number}`}
        description="Changes replace the current line items."
      />
      <DocumentForm
        kind="estimate"
        action={updateEstimateAction}
        customers={customers}
        products={products}
        taxRateBps={estimate.taxRateBps || taxRateBps}
        taxRates={taxRates}
        initial={{
          id: estimate.id,
          customerId: estimate.customerId,
          taxRateId: estimate.taxRateId,
          ticketId: estimate.ticketId,
          date: toDateInputValue(estimate.expiresAt),
          notes: estimate.notes,
          lines: estimate.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            taxable: line.taxable,
          })),
        }}
        submitLabel="Save changes"
        cancelHref={`/estimates/${estimate.id}`}
      />
    </div>
  );
}
