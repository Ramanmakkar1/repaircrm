import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/inventory/product-form";
import { ACTIONS, ICONS } from "@/components/ui/icons";
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
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All inventory
      </Link>

      <PageHeader
        icon={ICONS.product}
        title="New product"
        description="Only a name and a price are required — the rest can come later."
      />

      <ProductForm vendors={vendors} canSeeCost={role === "OWNER"} />
    </div>
  );
}
