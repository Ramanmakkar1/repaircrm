import type { Metadata } from "next";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "New customer · RepairFlow" };

/** The shop's named tax rates, for the customer form's preferred-rate picker. */
async function loadTaxRates(shopId: string) {
  return db.taxRate.findMany({
    where: { shopId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      rateBps: true,
      isDefault: true,
      active: true,
    },
  });
}

export default async function NewCustomerPage() {
  const { shopId } = await requireUser();
  const taxRates = await loadTaxRates(shopId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: "New customer" },
        ]}
        title="New customer"
        description="Only a first and last name are required — everything else can come later."
      />

      <CustomerForm taxRates={taxRates} />
    </div>
  );
}
