import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { formatDate } from "@/components/billing/format";
import { poFilterCounts, purchaseOrderSearch } from "@/components/inventory/easy-lists";
import { ListSearch } from "@/components/inventory/list-search";
import { PurchaseOrderCard } from "@/components/inventory/purchase-order-card";
import { SupplierFilter } from "@/components/inventory/supplier-filter";
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
import { RecordGrid } from "@/components/ui/record-card";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "Purchase orders · Repairs helper" };

const ALL_VENDORS = "";

type SearchParams = { status?: string; vendorId?: string; q?: string };

const LIST_LIMIT = 100;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shopId } = await requireRole("OWNER");
  const [params, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  const easy = prefs.simple;

  const filter = asPoFilter(params.status);
  const vendorId = (params.vendorId ?? "").trim();
  // The search box is an Easy-mode control; the dense table has no box to put one in.
  const query = easy ? (params.q ?? "").trim() : "";
  const search = purchaseOrderSearch(query);

  // Who and what is being looked at, before the status view narrows it further.
  const scope: Prisma.PurchaseOrderWhereInput = { shopId, ...(vendorId ? { vendorId } : {}), ...(search ?? {}) };
  const where: Prisma.PurchaseOrderWhereInput = { ...scope };
  // "Open" is the buyer's default view: anything not finished or called off.
  if (filter === "open") where.status = { in: ["DRAFT", "ORDERED", "PARTIAL"] };
  else if (filter !== "all") where.status = filter;

  const [orders, vendors, countRows] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: { number: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        number: true,
        status: true,
        shippingCents: true,
        createdAt: true,
        orderedAt: true,
        expectedAt: true,
        receivedAt: true,
        vendor: { select: { id: true, name: true } },
        lines: { select: { quantity: true, unitCostCents: true, receivedQty: true } },
      },
    }),
    db.vendor.findMany({
      where: { shopId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // The number on each tab: how many orders sit in that view for this supplier and search.
    easy
      ? db.purchaseOrder.groupBy({ by: ["status"], where: scope, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const counts = poFilterCounts(countRows.map((row) => ({ status: row.status, count: row._count._all })));

  const filtered = filter !== "open" || vendorId !== "" || query !== "";

  const vendorOptions = [
    { label: "All", href: hrefFor(filter, ALL_VENDORS, query), active: vendorId === "" },
    ...vendors.map((vendor) => ({
      label: vendor.name,
      href: hrefFor(filter, vendor.id, query),
      active: vendorId === vendor.id,
    })),
  ];

  const newOrder = (
    <Button asChild>
      <Link href="/inventory/purchase-orders/new">
        <ACTIONS.add />
        {easy ? "New order" : "New Purchase Order"}
      </Link>
    </Button>
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
        title="Purchase orders"
        description={
          easy
            ? "What you have ordered from suppliers, and what has arrived."
            : "What the shop has asked its vendors for, and how much of it has landed."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/inventory/vendors">
                <ICONS.vendor />
                {easy ? "Suppliers" : "Vendors"}
              </Link>
            </Button>
            {newOrder}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Purchase order views"
          tabs={PO_FILTERS.map((key) => ({
            label: PO_FILTER_LABELS[key],
            href: hrefFor(key, vendorId, query),
            active: filter === key,
            count: easy ? counts[key] : undefined,
          }))}
        />

        {easy ? (
          <ListSearch
            path="/inventory/purchase-orders"
            query={query}
            keep={{ status: filter === "open" ? "" : filter, vendorId }}
            placeholder="Search order number or supplier"
            label="Search purchase orders"
          />
        ) : null}

        {/* One supplier is not a choice, so Easy mode only offers the row once there is something to pick between. */}
        {vendors.length > (easy ? 1 : 0) ? (
          easy ? (
            <SupplierFilter current={vendors.find((vendor) => vendor.id === vendorId)?.name ?? "All"} options={vendorOptions} />
          ) : (
            <FilterChips label="Vendor" options={vendorOptions} />
          )
        ) : null}
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="px-0 py-0">
            <EmptyState
              icon={ICONS.purchaseOrder}
              title={filtered ? "Nothing matches those filters" : "No purchase orders yet"}
              hint={
                filtered
                  ? easy
                    ? "Try a shorter search, the All tab, or a different supplier."
                    : "Try the All pill, or pick a different vendor."
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
                  newOrder
                )
              }
            />
          </CardContent>
        </Card>
      ) : easy ? (
        <section aria-label="Purchase orders" className="flex flex-col gap-4">
          <RecordGrid>
            {orders.map((order) => (
              <PurchaseOrderCard key={order.id} order={order} />
            ))}
          </RecordGrid>
          {orders.length >= LIST_LIMIT ? (
            <p className="text-center text-sm text-muted-foreground">
              Showing the latest {LIST_LIMIT} orders. Search to find an older one.
            </p>
          ) : null}
        </section>
      ) : (
        <Card>
          <CardContent className="px-0 py-0">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function hrefFor(status: PoFilter, vendorId: string, query = ""): string {
  const search = new URLSearchParams();
  if (status !== "open") search.set("status", status);
  if (vendorId) search.set("vendorId", vendorId);
  if (query) search.set("q", query);
  const qs = search.toString();
  return qs ? `/inventory/purchase-orders?${qs}` : "/inventory/purchase-orders";
}

