import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus, Store } from "lucide-react";

import { VendorCard, type VendorCardData } from "@/components/inventory/vendor-card";
import { VendorDialog } from "@/components/inventory/vendor-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Vendors · RepairFlow" };

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  // Purchasing is an owner surface — vendor records and their orders are the
  // shop's buying prices, which the rest of the app already hides by role.
  const { shopId } = await requireRole("OWNER");
  const { show } = await searchParams;
  const includeInactive = show === "all";

  const vendors = await db.vendor.findMany({
    where: { shopId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      website: true,
      accountNumber: true,
      address: true,
      notes: true,
      active: true,
      _count: {
        select: {
          products: true,
          // Still outstanding with this vendor.
          purchaseOrders: {
            where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } },
          },
        },
      },
    },
  });

  const inactiveCount = await db.vendor.count({ where: { shopId, active: false } });

  const cards: VendorCardData[] = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    website: vendor.website,
    accountNumber: vendor.accountNumber,
    address: vendor.address,
    notes: vendor.notes,
    active: vendor.active,
    productCount: vendor._count.products,
    openPoCount: vendor._count.purchaseOrders,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Vendors" }]}
        title="Vendors"
        description="Everyone the shop buys parts from, and what's on order with them."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/inventory/purchase-orders">
                <ClipboardList />
                Purchase orders
              </Link>
            </Button>
            <VendorDialog
              trigger={
                <Button>
                  <Plus />
                  New Vendor
                </Button>
              }
            />
          </>
        }
      />

      {inactiveCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Pill href="/inventory/vendors" active={!includeInactive}>
            Active only
          </Pill>
          <Pill href="/inventory/vendors?show=all" active={includeInactive}>
            Include inactive ({inactiveCount})
          </Pill>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title={includeInactive ? "No vendors yet" : "No active vendors"}
            hint="Add the suppliers you order parts from so purchase orders, costs and reorder points all point somewhere real."
            action={
              <VendorDialog
                trigger={
                  <Button>
                    <Plus />
                    New Vendor
                  </Button>
                }
              />
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
        active
          ? "border-transparent bg-accent text-accent-foreground shadow-sm"
          : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
