import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/inventory/product-form";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "New product · RepairPilot" };

/**
 * `?upc=` / `?sku=` seed the form.
 *
 * That is the register's "No product matches 0123456789012 — create one"
 * shortcut arriving: the code scanned cleanly, it just is not in the catalogue
 * yet, and retyping twelve digits is exactly the work the camera was supposed
 * to remove. Both are trimmed and capped; they are only ever form values.
 */
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ upc?: string; sku?: string }>;
}) {
  const { shopId, role } = await requireUser();
  const seed = await searchParams;

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
        title="New product"
        description="Only a name and a price are required — the rest can come later."
      />

      <ProductForm
        vendors={vendors}
        canSeeCost={role === "OWNER"}
        defaults={{
          upc: seed.upc?.trim().slice(0, 64),
          sku: seed.sku?.trim().slice(0, 64),
        }}
      />
    </div>
  );
}
