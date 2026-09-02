import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "@/components/billing/document-form";
import { loadDocumentFormData } from "@/components/billing/queries";
import { createEstimateAction } from "../actions";

export const metadata = { title: "New estimate · RepairFlow" };

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

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
        icon={ICONS.estimate}
        title="New estimate"
        description="Quote the job first — an approved estimate becomes an invoice in one click."
      />
      <DocumentForm
        kind="estimate"
        action={createEstimateAction}
        customers={customers}
        products={products}
        taxRateBps={taxRateBps}
        taxRates={taxRates}
        initial={{
          customerId: prefillCustomer?.id ?? prefillTicket?.customerId ?? null,
          ticketId: prefillTicket?.id ?? null,
        }}
        submitLabel="Create estimate"
        cancelHref="/estimates"
      />
    </div>
  );
}
