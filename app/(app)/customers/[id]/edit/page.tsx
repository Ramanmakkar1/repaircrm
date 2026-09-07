import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/customers/customer-form";
import { fullName } from "@/components/customers/format";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit customer · RepairFlow" };

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

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  // findFirst (not findUnique) so an id from another shop 404s instead of leaking.
  const customer = await db.customer.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      mobile: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      referredBy: true,
      notes: true,
      smsOptIn: true,
      emailOptIn: true,
      taxExempt: true,
      taxRateId: true,
    },
  });

  if (!customer) notFound();

  const taxRates = await loadTaxRates(shopId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: fullName(customer), href: `/customers/${customer.id}` },
          { label: "Edit" },
        ]}
        title="Edit customer"
        description="Changes apply from the next ticket, estimate and invoice on."
      />

      <CustomerForm customer={customer} taxRates={taxRates} />
    </div>
  );
}
