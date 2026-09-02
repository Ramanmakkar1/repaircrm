import type { Metadata } from "next";
import Link from "next/link";

import { VendorCard, type VendorCardData } from "@/components/inventory/vendor-card";
import { VendorDialog } from "@/components/inventory/vendor-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
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
      <Link
        href="/inventory"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All inventory
      </Link>

      <PageHeader
        icon={ICONS.vendor}
        title="Vendors"
        description="Everyone the shop buys parts from, and what's on order with them."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/inventory/purchase-orders">
                <ICONS.purchaseOrder />
                Purchase orders
              </Link>
            </Button>
            <VendorDialog
              trigger={
                <Button>
                  <ACTIONS.add />
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
            icon={ICONS.vendor}
            title={
              !includeInactive && inactiveCount > 0
                ? "No active vendors"
                : "No vendors yet"
            }
            hint={
              // Telling somebody with twelve retired vendors to add their first
              // one is the wrong sentence — point them at the other pill.
              !includeInactive && inactiveCount > 0
                ? `Every vendor on file has been deactivated. Show the ${inactiveCount} inactive ${inactiveCount === 1 ? "one" : "ones"}, or add a new supplier.`
                : "Add the suppliers you order parts from so purchase orders, costs and reorder points all point somewhere real."
            }
            action={
              !includeInactive && inactiveCount > 0 ? (
                <Button variant="outline" asChild>
                  <Link href="/inventory/vendors?show=all">Include inactive</Link>
                </Button>
              ) : (
                <VendorDialog
                  trigger={
                    <Button>
                      <ACTIONS.add />
                      New Vendor
                    </Button>
                  }
                />
              )
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-accent text-accent-foreground shadow-sm"
          : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
