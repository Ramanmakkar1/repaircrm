import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
      <Link
        href="/customers"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Customers
      </Link>

      <PageHeader
        title="New customer"
        description="Only a first and last name are required — everything else can come later."
      />

      <CustomerForm taxRates={taxRates} />
    </div>
  );
}
