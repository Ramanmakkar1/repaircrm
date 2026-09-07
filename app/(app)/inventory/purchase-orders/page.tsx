import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { formatDate } from "@/components/billing/format";
import {
  PO_FILTERS,
  PO_FILTER_LABELS,
  PO_STATUS_META,
  asPoFilter,
  asPoStatus,
  poTotals,
  type PoFilter,
} from "@/components/inventory/purchasing";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Purchase orders · RepairFlow" };

const ALL_VENDORS = "";

type SearchParams = { status?: string; vendorId?: string };

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shopId } = await requireRole("OWNER");
  const params = await searchParams;

  const filter = asPoFilter(params.status);
  const vendorId = (params.vendorId ?? "").trim();

  const where: Prisma.PurchaseOrderWhereInput = { shopId };
  // "Open" is the buyer's default view: anything not finished or called off.
  if (filter === "open") where.status = { in: ["DRAFT", "ORDERED", "PARTIAL"] };
  else if (filter !== "all") where.status = filter;
  if (vendorId) where.vendorId = vendorId;

  const [orders, vendors] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: { number: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        shippingCents: true,
        createdAt: true,
        orderedAt: true,
        expectedAt: true,
        vendor: { select: { id: true, name: true } },
        lines: { select: { quantity: true, unitCostCents: true, receivedQty: true } },
      },
    }),
    db.vendor.findMany({
      where: { shopId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const filtered = filter !== "open" || vendorId !== "";

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
        title="Purchase orders"
        description="What the shop has asked its vendors for, and how much of it has landed."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/inventory/vendors">
                <ICONS.vendor />
                Vendors
              </Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/purchase-orders/new">
                <ACTIONS.add />
                New Purchase Order
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Purchase order views"
          tabs={PO_FILTERS.map((key) => ({
            label: PO_FILTER_LABELS[key],
            href: hrefFor(key, vendorId),
            active: filter === key,
          }))}
        />

        {vendors.length > 0 ? (
          <FilterChips
            label="Vendor"
            options={[
              {
                label: "All",
                href: hrefFor(filter, ALL_VENDORS),
                active: vendorId === "",
              },
              ...vendors.map((vendor) => ({
                label: vendor.name,
                href: hrefFor(filter, vendor.id),
                active: vendorId === vendor.id,
              })),
            ]}
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {orders.length === 0 ? (
            <EmptyState
              icon={ICONS.purchaseOrder}
              title={filtered ? "Nothing matches those filters" : "No purchase orders yet"}
              hint={
                filtered
                  ? "Try the All pill, or pick a different vendor."
                  : "Raise an order to record what you asked a vendor for — receiving it moves stock, updates costs and logs the adjustment."
              }
              action={
                filtered ? (
                  <Button variant="outline" asChild>
                    <Link href="/inventory/purchase-orders?status=all">Clear filters</Link>
                  </Button>
                ) : vendors.length === 0 ? (
                  <Button asChild>
                    <Link href="/inventory/vendors">
                      <ICONS.vendor />
                      Add a vendor first
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/inventory/purchase-orders/new">
                      <ACTIONS.add />
                      New Purchase Order
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>PO</Th>
                  <Th>Vendor</Th>
                  <Th>Status</Th>
                  <Th>Raised</Th>
                  <Th>Expected</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Total</Th>
                </Tr>
              </THead>
              <TBody>
                {orders.map((order) => {
                  const totals = poTotals(order.lines, order.shippingCents);
                  const meta = PO_STATUS_META[asPoStatus(order.status)];
                  return (
                    <Tr key={order.id}>
                      <Td>
                        <Link
                          href={`/inventory/purchase-orders/${order.id}`}
                          className="rf-id font-semibold text-accent-soft-foreground hover:underline"
                        >
                          #{order.number}
                        </Link>
                      </Td>
                      <Td>
                        <Link
                          href={`/inventory/vendors/${order.vendor.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {order.vendor.name}
                        </Link>
                      </Td>
                      <Td>
                        <StatusPill
                          tone={meta.tone}
                          label={meta.label}
                          struck={meta.struck}
                        />
                      </Td>
                      <Td className="text-[13.5px] text-muted-foreground">
                        {formatDate(order.orderedAt ?? order.createdAt)}
                      </Td>
                      <Td className="text-[13.5px] text-muted-foreground">
                        {order.expectedAt ? formatDate(order.expectedAt) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-muted-foreground">
                        {totals.receivedQty} / {totals.orderedQty}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums text-foreground">
                        {formatCents(totals.totalCents)}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function hrefFor(status: PoFilter, vendorId: string): string {
  const search = new URLSearchParams();
  if (status !== "open") search.set("status", status);
  if (vendorId) search.set("vendorId", vendorId);
  const qs = search.toString();
  return qs ? `/inventory/purchase-orders?${qs}` : "/inventory/purchase-orders";
}

