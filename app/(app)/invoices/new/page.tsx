import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUiPrefs } from "@/lib/prefs";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentForm } from "@/components/billing/document-form";
import { loadDocumentFormData } from "@/components/billing/queries";
import { loadOpenRepairs, loadRecentCustomerIds } from "@/components/billing/bill/server";
import { createInvoiceAction } from "../actions";

export const metadata = { title: "New invoice · Repairs helper" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const [{ customers, products, taxRateBps, taxRates }, uiPrefs] =
    await Promise.all([loadDocumentFormData(shopId), readUiPrefs()]);

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

  // Easy mode is a bill builder (choices left, "This invoice" right) and needs the width. It also
  // offers the few people billed last and the customer's open repairs; Full mode needs neither.
  const [recentCustomerIds, repairs] = uiPrefs.simple
    ? await Promise.all([
        loadRecentCustomerIds(shopId, "invoice"),
        loadOpenRepairs(shopId, prefillTicket?.id),
      ])
    : [undefined, undefined];

  // Easy mode hands the title to the builder, which draws it at the top of the choices so that
  // "This invoice" can start at the very top of the page; Full mode keeps it above the form.
  const header = (
    <PageHeader
      breadcrumbs={uiPrefs.simple ? [{ label: "Invoices", href: "/invoices" }, { label: "New invoice" }] : undefined}
      title="New invoice"
      description={uiPrefs.simple ? undefined : "Add line items, then save as a draft you can review before sending."}
    />
  );

  return (
    <div className={uiPrefs.simple ? "mx-auto flex w-full max-w-6xl flex-col gap-4" : "flex flex-col"}>
      {uiPrefs.simple ? null : header}
      <DocumentForm
        simple={uiPrefs.simple}
        header={uiPrefs.simple ? header : undefined}
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
        repairs={repairs}
        recentCustomerIds={recentCustomerIds}
        submitLabel="Create invoice"
        cancelHref="/invoices"
      />
    </div>
  );
}
