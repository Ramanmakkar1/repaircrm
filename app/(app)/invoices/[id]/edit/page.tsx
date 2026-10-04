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
import { updateInvoiceAction } from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: invoice
      ? `Edit invoice #${invoice.number} · Repairs helper`
      : "Edit invoice · Repairs helper",
  };
}

/**
 * Change a saved invoice.
 *
 * Easy mode is the same bill builder as New invoice, opened on "Check and
 * save" with the invoice's own lines, tax snapshot, due date and notes, and
 * posting the same fields (plus the invoice's `id`) to `updateInvoiceAction`.
 * Full mode keeps the dense form. A paid or void invoice cannot change: it
 * says so in words instead of bouncing back to the invoice.
 */
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, { simple }] = await Promise.all([params, readUiPrefs()]);

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });
  if (!invoice) notFound();

  // A paid or voided invoice is a settled record (the update action refuses
  // it too), so say why instead of showing a form whose save would bounce.
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
    const word = invoice.status === "VOID" ? "voided" : invoice.status === "PAID" ? "paid" : "part-paid";
    return (
      <LockedDocument
        title={`Invoice #${invoice.number} is ${word}`}
        reason={
          invoice.status === "VOID"
            ? "A voided invoice stays on record as it is. Make a new invoice if something needs billing."
            : "Money has been taken on it, so its items can't change. To give money back, use Refund on the invoice."
        }
        action={{ label: `Back to invoice #${invoice.number}`, href: `/invoices/${invoice.id}` }}
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
              { label: "Invoices", href: "/invoices" },
              { label: `Invoice #${invoice.number}`, href: `/invoices/${invoice.id}` },
              { label: "Change" },
            ]
          : undefined
      }
      title={simple ? `Change invoice #${invoice.number}` : `Edit invoice #${invoice.number}`}
      description={simple ? undefined : "Saving puts these items on the invoice in place of the ones there now."}
    />
  );

  return (
    <div className={simple ? "mx-auto flex w-full max-w-6xl flex-col gap-4" : "flex flex-col"}>
      {simple ? null : header}
      <DocumentForm
        simple={simple}
        header={simple ? header : undefined}
        notice={
          simple && invoice.status === "SENT" ? (
            <AlreadySentNotice customerName={customerLabel(invoice.customer)} noun="invoice" />
          ) : undefined
        }
        kind="invoice"
        action={updateInvoiceAction}
        customers={customers}
        products={products}
        // The document's own snapshotted rate, so editing never silently
        // re-taxes it at a rate the customer has not seen.
        taxRateBps={invoice.taxRateBps || taxRateBps}
        taxRates={taxRates}
        initial={{
          id: invoice.id,
          customerId: invoice.customerId,
          taxRateId: invoice.taxRateId,
          taxRateBps: invoice.taxRateBps,
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
