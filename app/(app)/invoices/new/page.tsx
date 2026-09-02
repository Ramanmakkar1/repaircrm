import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "@/components/billing/document-form";
import { loadDocumentFormData } from "@/components/billing/queries";
import { createInvoiceAction } from "../actions";

export const metadata = { title: "New invoice · RepairFlow" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  // Prefills arrive as query params from the customer and ticket screens. Both
  // are re-verified against the shop before they are trusted as defaults.
  const requestedCustomerId =
    typeof params.customerId === "string" ? params.customerId : "";
  const requestedTicketId =
    typeof params.ticketId === "string" ? params.ticketId : "";

  const [prefillCustomer, prefillTicket] = await Promise.all([
    requestedCustomerId
      ? db.customer.findFirst({
          where: { id: requestedCustomerId, shopId },
          select: { id: true },
        })
      : null,
    requestedTicketId
      ? db.ticket.findFirst({
          where: { id: requestedTicketId, shopId },
          select: { id: true, customerId: true },
        })
      : null,
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="New invoice"
        description="Add line items, then save as a draft you can review before sending."
      />
      <DocumentForm
        kind="invoice"
        action={createInvoiceAction}
        customers={customers}
        products={products}
        taxRateBps={taxRateBps}
        taxRates={taxRates}
        initial={{
          customerId: prefillCustomer?.id ?? prefillTicket?.customerId ?? null,
          ticketId: prefillTicket?.id ?? null,
        }}
        submitLabel="Create invoice"
        cancelHref="/invoices"
      />
    </div>
  );
}
