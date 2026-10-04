import type { Metadata } from "next";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "New customer · Repairs helper" };

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
  const [{ shopId }, { simple }] = await Promise.all([requireUser(), readUiPrefs()]);
  const taxRates = await loadTaxRates(shopId);

  return (
    // Easy mode is a register: the two boxes on the left, "This customer" on the right, so it needs the width.
    <div className={simple ? "mx-auto flex w-full max-w-6xl flex-col gap-4" : "mx-auto flex w-full max-w-3xl flex-col gap-4"}>
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: "New customer" },
        ]}
        title="New customer"
        description={simple ? undefined : "Just a name or a phone number. Switch on anything else you need."}
      />

      <CustomerForm taxRates={taxRates} simple={simple} />
    </div>
  );
}
