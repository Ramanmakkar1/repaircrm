import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUiPrefs } from "@/lib/prefs";
import { PageHeader } from "@/components/ui/page-header";
import { customerLabel } from "@/components/customers/format";
import { DocumentForm } from "@/components/billing/document-form";
import { toDateInputValue } from "@/components/billing/format";
import { AlreadySentNotice, LockedDocument } from "@/components/billing/locked-document";
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
      ? `Edit estimate #${estimate.number} · Repairs helper`
      : "Edit estimate · Repairs helper",
  };
}

/**
 * Change a saved estimate. Easy mode is the bill builder in edit mode (same
 * fields, plus the estimate's `id`, to `updateEstimateAction`); Full mode keeps
 * the dense form. A quote that became an invoice says so instead of bouncing.
 */
export default async function EditEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, { simple }] = await Promise.all([params, readUiPrefs()]);

  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      customer: { select: { firstName: true, lastName: true, businessName: true } },
      invoices: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, number: true } },
    },
  });
  if (!estimate) notFound();

  // Once converted, the invoice is the live document — change that instead.
  if (estimate.status === "CONVERTED") {
    const invoice = estimate.invoices[0];
    return (
      <LockedDocument
        title={`Estimate #${estimate.number} is now an invoice`}
        reason={
          invoice
            ? `It became invoice #${invoice.number}. Change the invoice instead; the quote stays as it was agreed.`
            : "It was turned into an invoice. Change the invoice instead; the quote stays as it was agreed."
        }
        action={
          invoice
            ? { label: `Open invoice #${invoice.number}`, href: `/invoices/${invoice.id}` }
            : { label: `Back to estimate #${estimate.number}`, href: `/estimates/${estimate.id}` }
        }
      />
    );
  }

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  const header = (
    <PageHeader
      breadcrumbs={
        simple
          ? [
              { label: "Estimates", href: "/estimates" },
              { label: `Estimate #${estimate.number}`, href: `/estimates/${estimate.id}` },
              { label: "Change" },
            ]
          : undefined
      }
      title={simple ? `Change estimate #${estimate.number}` : `Edit estimate #${estimate.number}`}
      description={simple ? undefined : "Saving puts these items on the estimate in place of the ones there now."}
    />
  );

  return (
    <div className={simple ? "mx-auto flex w-full max-w-6xl flex-col gap-4" : "flex flex-col"}>
      {simple ? null : header}
      <DocumentForm
        simple={simple}
        header={simple ? header : undefined}
        notice={
          simple && estimate.status !== "DRAFT" ? (
            <AlreadySentNotice customerName={customerLabel(estimate.customer)} noun="estimate" />
          ) : undefined
        }
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
          taxRateBps: estimate.taxRateBps,
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
