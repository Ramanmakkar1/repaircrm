import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/inventory/product-form";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { readUiPrefs } from "@/lib/prefs";

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
    title: product ? `Edit ${product.name} · Repairs helper` : "Product · Repairs helper",
  };
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ shopId, role }, { simple }] = await Promise.all([requireUser(), readUiPrefs()]);
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
      warrantyDays: true,
      reorderQty: true,
      vendorId: true,
      vendorSku: true,
      serialized: true,
      active: true,
      catalogImage: true,
      attachments: PRODUCT_IMAGE_SELECT,
    },
  });
  if (!product) notFound();

  // Active vendors plus, if this product already points at a retired one, that
  // vendor too — otherwise opening the form would silently unset it on save.
  const vendors = await db.vendor.findMany({
    where: {
      shopId,
      OR: [
        { active: true },
        ...(product.vendorId ? [{ id: product.vendorId }] : []),
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className={simple ? "mx-auto flex w-full max-w-5xl flex-col gap-4" : "mx-auto flex w-full max-w-3xl flex-col gap-1"}>
      {simple ? (
        <PageHeader
          breadcrumbs={[
            { label: "Inventory", href: "/inventory" },
            { label: product.name, href: `/inventory/${product.id}` },
            { label: "Edit" },
          ]}
          title="Edit product"
          description="Stock on hand is adjusted from the product page, not here."
        />
      ) : (
        <>
          <Link
            href={`/inventory/${product.id}`}
            className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ACTIONS.back className="size-4" />
            {product.name}
          </Link>

          <PageHeader
            title="Edit product"
            description="Stock on hand is adjusted from the product page, not here."
          />
        </>
      )}

      <ProductForm simple={simple} product={{ ...product, imageUrl: product.attachments[0] ? `/files/${product.attachments[0].id}` : null }} vendors={vendors} canSeeCost={role === "OWNER"} />
    </div>
  );
}
