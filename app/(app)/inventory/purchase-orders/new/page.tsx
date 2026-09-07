import type { Metadata } from "next";
import Link from "next/link";

import {
  PurchaseOrderForm,
  type PoProductOption,
} from "@/components/inventory/purchase-order-form";
import { stockStatus } from "@/components/inventory/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "New purchase order · RepairFlow" };

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const { vendorId } = await searchParams;

  const [vendors, products] = await Promise.all([
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
      },
    }),
  ]);

  // "Low" is decided here, once, with the same rule the badge and the filter
  // pills use — the client must never re-derive a stock rule of its own.
  const options: PoProductOption[] = products.map((product) => ({
    ...product,
    low: stockStatus(product) !== "in" && stockStatus(product) !== "untracked",
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
        <Card className="mt-4">
          <EmptyState
            icon={ICONS.vendor}
            title="No active vendors"
            hint="A purchase order has to be addressed to someone. Add the supplier first, then come back."
            action={
              <Button asChild>
                <Link href="/inventory/vendors">
                  <ICONS.vendor />
                  Add a vendor
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <PurchaseOrderForm
          vendors={vendors}
          products={options}
          initialVendorId={vendorId}
        />
      )}
    </div>
  );
}
