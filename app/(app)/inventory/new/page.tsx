import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ProductForm } from "@/components/inventory/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "New product · RepairFlow" };

export default async function NewProductPage() {
  const { shopId, role } = await requireUser();

  const vendors = await db.vendor.findMany({
    where: { shopId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
      <Link
        href="/inventory"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Inventory
      </Link>

      <PageHeader
        title="New product"
        description="Only a name and a price are required — the rest can come later."
      />

      <ProductForm vendors={vendors} canSeeCost={role === "OWNER"} />
    </div>
  );
}
