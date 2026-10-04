import type { Metadata } from "next";
import Link from "next/link";

import { vendorSearch } from "@/components/inventory/easy-lists";
import { ListSearch } from "@/components/inventory/list-search";
import { VendorCard, type VendorCardData } from "@/components/inventory/vendor-card";
import { VendorDialog } from "@/components/inventory/vendor-dialog";
import { VendorEasyCard } from "@/components/inventory/vendor-easy-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { RecordGrid } from "@/components/ui/record-card";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Vendors · Repairs helper" };

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; q?: string }>;
}) {
  // Purchasing is an owner surface — vendor records and their orders are the
  // shop's buying prices, which the rest of the app already hides by role.
  const { shopId } = await requireRole("OWNER");
  const [{ show, q }, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  const includeInactive = show === "all";
  const easy = prefs.simple;
  // The search box is an Easy-mode control; the dense list has the whole book on one screen.
  const query = easy ? (q ?? "").trim() : "";
  const search = vendorSearch(query);

  const vendors = await db.vendor.findMany({
    where: { shopId, ...(includeInactive ? {} : { active: true }), ...(search ?? {}) },
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

  const [inactiveCount, activeCount] = await Promise.all([
    db.vendor.count({ where: { shopId, active: false } }),
    db.vendor.count({ where: { shopId, active: true } }),
  ]);
  // A view is a URL, and a search keeps whichever view it was made in.
  const viewHref = (all: boolean) => {
    const params = new URLSearchParams();
    if (all) params.set("show", "all");
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/inventory/vendors?${qs}` : "/inventory/vendors";
  };

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

  const newVendor = (
    <VendorDialog
      trigger={
        <Button>
          <ACTIONS.add />
          {easy ? "Add supplier" : "New Vendor"}
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {easy ? null : (
        <Link
          href="/inventory"
          className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ACTIONS.back className="size-4" />
          All inventory
        </Link>
      )}

      <PageHeader
        title={easy ? "Suppliers" : "Vendors"}
        description={
          easy
            ? "Who you buy parts from, and what is on order with them."
            : "Everyone the shop buys parts from, and what's on order with them."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/inventory/purchase-orders">
                <ICONS.purchaseOrder />
                Purchase orders
              </Link>
            </Button>
            {newVendor}
          </>
        }
      />

      {inactiveCount > 0 ? (
        <FilterTabs
          aria-label={easy ? "Supplier views" : "Vendor views"}
          tabs={
            easy
              ? [
                  { label: "Active", href: viewHref(false), active: !includeInactive, count: activeCount },
                  { label: "All", href: viewHref(true), active: includeInactive, count: activeCount + inactiveCount },
                ]
              : [
                  { label: "Active only", href: "/inventory/vendors", active: !includeInactive },
                  { label: "Include inactive", href: "/inventory/vendors?show=all", active: includeInactive, count: inactiveCount },
                ]
          }
        />
      ) : null}

      {easy ? (
        <ListSearch
          path="/inventory/vendors"
          query={query}
          keep={{ show: includeInactive ? "all" : "" }}
          placeholder="Search name, phone or email"
          label="Search suppliers"
        />
      ) : null}

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.vendor}
            title={
              query
                ? "No suppliers match that search"
                : !includeInactive && inactiveCount > 0
                  ? "No active vendors"
                  : "No vendors yet"
            }
            hint={
              // Telling somebody with twelve retired vendors to add their first
              // one is the wrong sentence — point them at the other pill.
              query
                ? "Try a shorter search, or clear it to see everyone."
                : !includeInactive && inactiveCount > 0
                  ? `Every vendor on file has been deactivated. Show the ${inactiveCount} inactive ${inactiveCount === 1 ? "one" : "ones"}, or add a new supplier.`
                  : "Add the suppliers you order parts from so purchase orders, costs and reorder points all point somewhere real."
            }
            action={
              query ? (
                <Button variant="outline" asChild>
                  <Link href={includeInactive ? "/inventory/vendors?show=all" : "/inventory/vendors"}>Clear search</Link>
                </Button>
              ) : !includeInactive && inactiveCount > 0 ? (
                <Button variant="outline" asChild>
                  <Link href="/inventory/vendors?show=all">Include inactive</Link>
                </Button>
              ) : (
                newVendor
              )
            }
          />
        </Card>
      ) : easy ? (
        <RecordGrid>
          {cards.map((vendor) => (
            <VendorEasyCard key={vendor.id} vendor={vendor} />
          ))}
        </RecordGrid>
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
