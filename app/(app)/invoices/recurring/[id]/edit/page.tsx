import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { toDateInputValue } from "@/components/billing/format";
import { loadDocumentFormData } from "@/components/billing/queries";
import { ScheduleForm } from "@/components/recurring/schedule-form";
import { updateScheduleAction } from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    select: { name: true },
  });
  return {
    title: schedule
      ? `Edit ${schedule.name} · RepairFlow`
      : "Edit schedule · RepairFlow",
  };
}

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!schedule) notFound();

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Edit ${schedule.name}`}
        description="Changes apply to the next invoice this schedule raises — invoices already generated are untouched."
      />
      <ScheduleForm
        action={updateScheduleAction}
        customers={customers}
        products={products}
        // The schedule's own snapshotted rate, so editing never silently
        // re-taxes a contract at a rate the customer has not agreed to.
        taxRateBps={schedule.taxRateBps || taxRateBps}
        taxRates={taxRates}
        initial={{
          id: schedule.id,
          name: schedule.name,
          customerId: schedule.customerId,
          taxRateId: schedule.taxRateId,
          frequency: schedule.frequency,
          nextRunAt: toDateInputValue(schedule.nextRunAt),
          dueInDays: schedule.dueInDays,
          active: schedule.active,
          autoCharge: schedule.autoCharge,
          autoSend: schedule.autoSend,
          lines: schedule.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            taxable: line.taxable,
          })),
        }}
        submitLabel="Save changes"
        cancelHref={`/invoices/recurring/${schedule.id}`}
      />
    </div>
  );
}
