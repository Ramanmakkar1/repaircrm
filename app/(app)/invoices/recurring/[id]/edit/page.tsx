import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUiPrefs } from "@/lib/prefs";
import { PageHeader } from "@/components/ui/page-header";
import { BillBuilder } from "@/components/billing/bill/builder";
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
      ? `Edit ${schedule.name} · Repairs helper`
      : "Edit repeat bill · Repairs helper",
  };
}

/**
 * Change a repeat bill. Easy mode is the bill builder in edit mode, opened on
 * "How often?" and posting the schedule's `id` and the same fields to
 * `updateScheduleAction`; Full mode keeps the dense form.
 */
export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, { simple }] = await Promise.all([params, readUiPrefs()]);

  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!schedule) notFound();

  const { customers, products, taxRateBps, taxRates } =
    await loadDocumentFormData(shopId);

  const lines = schedule.lines.map((line) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxable: line.taxable,
  }));

  if (simple) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <BillBuilder
          kind="repeat"
          mode="edit"
          documentId={schedule.id}
          action={updateScheduleAction}
          customers={customers}
          products={products}
          taxRateBps={taxRateBps}
          taxRates={taxRates}
          header={
            <PageHeader
              breadcrumbs={[
                { label: "Repeat bills", href: "/invoices/recurring" },
                { label: schedule.name, href: `/invoices/recurring/${schedule.id}` },
                { label: "Change" },
              ]}
              title="Change repeat bill"
            />
          }
          initial={{
            customerId: schedule.customerId,
            date: toDateInputValue(schedule.nextRunAt),
            lines,
            // The schedule's own snapshotted rate: opening it never re-taxes it.
            tax: { taxRateId: schedule.taxRateId, taxRateBps: schedule.taxRateBps },
            repeat: {
              name: schedule.name,
              frequency: schedule.frequency,
              dueInDays: schedule.dueInDays,
              active: schedule.active,
              autoSend: schedule.autoSend,
              autoCharge: schedule.autoCharge,
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Edit ${schedule.name}`}
        description="Changes count from the next bill on. Bills already made stay as they are."
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
          lines,
        }}
        submitLabel="Save changes"
        cancelHref={`/invoices/recurring/${schedule.id}`}
      />
    </div>
  );
}
