import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { loadDocumentFormData } from "@/components/billing/queries";
import { toDateInputValue } from "@/components/billing/format";
import { ScheduleForm } from "@/components/recurring/schedule-form";
import { createScheduleAction } from "../actions";

export const metadata = { title: "New recurring schedule · RepairPilot" };

export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  // Prefill arrives as a query param from the customer hub; re-verified against
  // the shop before it is trusted as a default.
  const requestedCustomerId =
    typeof params.customerId === "string" ? params.customerId : "";
  const prefillCustomer = requestedCustomerId
    ? await db.customer.findFirst({
        where: { id: requestedCustomerId, shopId },
        select: { id: true },
      })
    : null;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="New recurring schedule"
        description="Every run raises a draft invoice you can review before it goes out."
      />
      <ScheduleForm
        action={createScheduleAction}
        customers={customers}
        products={products}
        taxRateBps={taxRateBps}
        taxRates={taxRates}
        initial={{
          customerId: prefillCustomer?.id ?? null,
          frequency: "MONTHLY",
          nextRunAt: toDateInputValue(new Date()),
          dueInDays: 14,
          active: true,
        }}
        submitLabel="Create schedule"
        cancelHref="/invoices/recurring"
      />
    </div>
  );
}
