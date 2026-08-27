import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { ProductForm } from "@/components/inventory/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const product = await db.product.findFirst({
    where: { id, shopId },
    select: { name: true },
  });

  return {
    title: product ? `Edit ${product.name} · RepairFlow` : "Product · RepairFlow",
  };
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;

  // Scoped by shopId, so a guessed id from another tenant 404s rather than
  // handing over an edit form for somebody else's catalogue.
  const product = await db.product.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      name: true,
      category: true,
      sku: true,
      upc: true,
      description: true,
      priceCents: true,
      costCents: true,
      taxable: true,
      stockQty: true,
      lowStockAt: true,
      active: true,
    },
  });
  if (!product) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
      <Link
        href={`/inventory/${product.id}`}
        className="inline-flex w-fit items-center gap-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {product.name}
      </Link>

      <PageHeader
        title="Edit product"
        description="Stock on hand is adjusted from the product page, not here."
      />

      <ProductForm product={product} canSeeCost={role === "OWNER"} />
    </div>
  );
}
