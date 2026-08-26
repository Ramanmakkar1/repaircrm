import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "@/components/billing/document-form";
import { toDateInputValue } from "@/components/billing/format";
import { loadDocumentFormData } from "@/components/billing/queries";
import { updateInvoiceAction } from "../../actions";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) notFound();

  // A paid or voided invoice is a settled record. Bounce back to the detail
  // view rather than rendering a form whose submit would be rejected anyway.
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
    redirect(`/invoices/${invoice.id}`);
  }

  const { customers, products, taxRateBps } = await loadDocumentFormData(shopId);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Edit invoice #${invoice.number}`}
        description="Changes replace the current line items."
      />
      <DocumentForm
        kind="invoice"
        action={updateInvoiceAction}
        customers={customers}
        products={products}
        // The document's own snapshotted rate, so editing never silently
        // re-taxes it at a rate the customer has not seen.
        taxRateBps={invoice.taxRateBps || taxRateBps}
        initial={{
          id: invoice.id,
          customerId: invoice.customerId,
          ticketId: invoice.ticketId,
          date: toDateInputValue(invoice.dueDate),
          notes: invoice.notes,
          lines: invoice.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            taxable: line.taxable,
            serial: line.serial,
          })),
        }}
        submitLabel="Save changes"
        cancelHref={`/invoices/${invoice.id}`}
      />
    </div>
  );
}
