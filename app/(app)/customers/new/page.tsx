import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New customer · RepairFlow" };

export default async function NewCustomerPage() {
  await requireUser();

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

      <CustomerForm />
    </div>
  );
}
