import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { PageHeader } from "@/components/ui/page-header";
import { BillBuilder } from "@/components/billing/bill/builder";
import { loadRecentCustomerIds } from "@/components/billing/bill/server";
import { loadShopZone } from "@/components/billing/print-queries";
import { loadDocumentFormData } from "@/components/billing/queries";
import { shopTodayKey } from "@/components/billing/shop-clock";
import { ScheduleForm } from "@/components/recurring/schedule-form";
import { createScheduleAction } from "../actions";

export const metadata = { title: "New repeat bill · Repairs helper" };

/**
 * A new repeat bill (recurring invoice).
 *
 * Easy mode is the bill builder: who, what goes on each bill, then "How
 * often?" as tiles with the whole schedule said back in one sentence. It posts
 * the same fields to `createScheduleAction` as the Full-mode form, which stays
 * as it was.
 */
export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [params, { simple }, zone] = await Promise.all([searchParams, readUiPrefs(), loadShopZone(shopId)]);

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

  // The first bill defaults to today on the shop's own calendar.
  const today = shopTodayKey(requestNow(), zone);

  if (simple) {
    const recentCustomerIds = await loadRecentCustomerIds(shopId, "invoice");
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <BillBuilder
          kind="repeat"
          action={createScheduleAction}
          customers={customers}
          products={products}
          taxRateBps={taxRateBps}
          taxRates={taxRates}
          recentCustomerIds={recentCustomerIds}
          header={
            <PageHeader
              breadcrumbs={[
                { label: "Invoices", href: "/invoices" },
                { label: "Repeat bills", href: "/invoices/recurring" },
                { label: "New" },
              ]}
              title="New repeat bill"
            />
          }
          initial={{
            customerId: prefillCustomer?.id ?? null,
            date: today,
            repeat: { frequency: "MONTHLY", dueInDays: 14, active: true },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="New repeat bill"
        description="Each time it comes round, a draft invoice is made for you to check before it goes out."
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
          nextRunAt: today,
          dueInDays: 14,
          active: true,
        }}
        submitLabel="Create schedule"
        cancelHref="/invoices/recurring"
      />
    </div>
  );
}
