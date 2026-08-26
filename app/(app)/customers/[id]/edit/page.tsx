import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CustomerForm } from "@/components/customers/customer-form";
import { fullName } from "@/components/customers/format";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit customer · RepairFlow" };

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
    },
  });

  if (!customer) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
      <Link
        href={`/customers/${customer.id}`}
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {fullName(customer)}
      </Link>

      <PageHeader title="Edit customer" />

      <CustomerForm customer={customer} />
    </div>
  );
}
