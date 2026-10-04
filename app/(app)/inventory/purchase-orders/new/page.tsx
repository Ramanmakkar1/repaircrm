import type { Metadata } from "next";
import Link from "next/link";

import { PoBuilder } from "@/components/inventory/po-builder";
import type { PoBuilderProduct } from "@/components/inventory/po-flow";
import {
  PurchaseOrderForm,
  type PoProductOption,
} from "@/components/inventory/purchase-order-form";
import { stockStatus } from "@/components/inventory/format";
import { onOrderByProduct } from "@/components/inventory/restock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "New order · Repairs helper" };

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; add?: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const [{ vendorId, add }, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  const easy = prefs.simple;

  const [vendors, products, openLines] = await Promise.all([
    db.vendor.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        vendorSku: true,
        vendorId: true,
        costCents: true,
        stockQty: true,
        lowStockAt: true,
        reorderQty: true,
        category: true,
        catalogImage: true,
        attachments: PRODUCT_IMAGE_SELECT,
      },
    }),
    // What is already coming, so a tile can say "3 on order" before someone orders it twice.
    // PurchaseOrderLine has no shopId: it is scoped through its order.
    easy
      ? db.purchaseOrderLine.findMany({
          where: { productId: { not: null }, purchaseOrder: { shopId, status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } },
          select: { productId: true, quantity: true, receivedQty: true },
        })
      : Promise.resolve([]),
  ]);

  // "Low" is decided here, once, with the same rule the badge and the filter
  // pills use — the client must never re-derive a stock rule of its own.
  const coming = onOrderByProduct(openLines);
  const options: PoBuilderProduct[] = products.map(({ attachments, ...product }) => ({
    ...product,
    low: stockStatus(product) !== "in" && stockStatus(product) !== "untracked",
    onOrder: coming.get(product.id) ?? 0,
    imageUrl: attachments?.[0] ? `/files/${attachments[0].id}` : null,
  }));

  const empty = (
    <Card className="mt-4">
      <EmptyState
        icon={ICONS.vendor}
        title={easy ? "Add a supplier first" : "No active vendors"}
        hint={
          easy
            ? "An order goes to someone. Add the supplier you buy from, then come back."
            : "A purchase order has to be addressed to someone. Add the supplier first, then come back."
        }
        action={
          <Button asChild className={easy ? "h-12 px-5 text-base" : undefined}>
            <Link href="/inventory/vendors">
              <ICONS.vendor />
              {easy ? "Add a supplier" : "Add a vendor"}
            </Link>
          </Button>
        }
      />
    </Card>
  );

  if (easy) {
    const header = <PageHeader title="New order" description="Choose the supplier, tap what you need, then place the order." />;
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-1">
        {vendors.length === 0 ? (
          <>
            {header}
            {empty}
          </>
        ) : (
          <PoBuilder vendors={vendors} products={options} initialVendorId={vendorId} add={add} header={header} />
        )}
      </div>
    );
  }

  const legacy: PoProductOption[] = options.map((option) => ({
    id: option.id,
    name: option.name,
    sku: option.sku,
    vendorSku: option.vendorSku,
    vendorId: option.vendorId,
    costCents: option.costCents,
    stockQty: option.stockQty,
    lowStockAt: option.lowStockAt,
    reorderQty: option.reorderQty,
    low: option.low,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-1">
      <Link
        href="/inventory/purchase-orders"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All purchase orders
      </Link>

      <PageHeader
        title="New purchase order"
        description="Pick a vendor, then add lines by hand or pull in everything that's running low."
      />

      {vendors.length === 0 ? (
        empty
      ) : (
        <PurchaseOrderForm vendors={vendors} products={legacy} initialVendorId={vendorId} />
      )}
    </div>
  );
}
