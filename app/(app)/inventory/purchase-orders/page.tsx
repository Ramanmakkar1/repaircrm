import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { formatDate } from "@/components/billing/format";
import { poFilterCounts, purchaseOrderSearch } from "@/components/inventory/easy-lists";
import { ListSearch } from "@/components/inventory/list-search";
import { PurchaseOrderCard } from "@/components/inventory/purchase-order-card";
import { SupplierFilter } from "@/components/inventory/supplier-filter";
import {
  PO_EASY_TABS,
  PO_FILTER_LABELS,
  PO_FULL_FILTERS,
  PO_STATUS_META,
  asPoFilter,
  asPoStatus,
  poFilterStatuses,
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
import { isLate, shopTodayKey } from "@/lib/inventory/dates";
import { shopZone } from "@/lib/inventory/shop-zone";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
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
  // "On the way" is ordered or part-arrived. A single status is that status.
  const statuses = poFilterStatuses(filter);
  if (statuses && statuses.length > 1) where.status = { in: statuses };
  else if (statuses) where.status = statuses[0];

  const [orders, vendors, countRows, zone] = await Promise.all([
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
    // "Late" turns on at the shop's midnight, not the server's.
    easy ? shopZone(shopId) : Promise.resolve("UTC"),
  ]);
  const counts = poFilterCounts(countRows.map((row) => ({ status: row.status, count: row._count._all })));
  const todayKey = shopTodayKey(requestNow(), zone);
  // A late delivery is the first thing a buyer chases, so it leads its view.
  const ordered = easy
    ? [...orders].sort((a, b) => Number(isLate(b, todayKey)) - Number(isLate(a, todayKey)))
    : orders;

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
        {easy ? (
          <FilterTabs
            aria-label="Purchase order views"
            tabs={PO_EASY_TABS.map((tab) => ({
              label: tab.label,
              href: hrefFor(tab.key, vendorId, query),
              active: filter === tab.key,
              count: counts[tab.key],
            }))}
            trailing={
              // The rare views (everything, canceled) live behind one quiet link, not more tabs.
              <Link
                href={hrefFor(filter === "all" ? "open" : "all", vendorId, query)}
                data-touch-control
                aria-current={filter === "all" ? "page" : undefined}
                className="inline-flex min-h-12 items-center whitespace-nowrap rounded-xl px-3 text-[15px] font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {filter === "all" ? "Show open orders" : `All orders (${counts.all})`}
              </Link>
            }
          />
        ) : (
          <FilterTabs
            aria-label="Purchase order views"
            tabs={PO_FULL_FILTERS.map((key) => ({
              label: PO_FILTER_LABELS[key],
              href: hrefFor(key, vendorId, query),
              active: filter === key,
            }))}
          />
        )}

        {easy && !["open", "all", ...PO_EASY_TABS.map((tab) => tab.key)].includes(filter) ? (
          // A view with no tab of its own (an old ?status= link): say what is on screen.
          <p className="text-base text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{PO_FILTER_LABELS[filter].toLowerCase()}</span> orders.{" "}
            <Link href={hrefFor("open", vendorId, query)} className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
              Show open orders
            </Link>
          </p>
        ) : null}

        {/* A handful of orders needs no search box; one appears once there is something to search. */}
        {easy && (query !== "" || counts.all > 8) ? (
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
              title={
                filtered
                  ? easy && !query && !vendorId
                    ? emptyViewTitle(filter)
                    : "Nothing matches those filters"
                  : easy
                    ? "Nothing on order"
                    : "No purchase orders yet"
              }
              hint={
                filtered
                  ? easy
                    ? query || vendorId
                      ? "Try a shorter search, All orders, or a different supplier."
                      : "Orders show up here as you place them."
                    : "Try the All pill, or pick a different vendor."
                  : easy
                    ? "Start an order when something runs low. When the box arrives, book it in and the stock goes up by itself."
                    : "Raise an order to record what you asked a supplier for. Booking the delivery in puts it on the shelf and updates its cost."
              }
              action={
                filtered ? (
                  <Button variant="outline" asChild>
                    <Link href="/inventory/purchase-orders?status=all">{easy && !query && !vendorId ? "See all orders" : "Clear filters"}</Link>
                  </Button>
                ) : vendors.length === 0 ? (
                  <Button asChild>
                    <Link href="/inventory/vendors">
                      <ICONS.vendor />
                      {easy ? "Add a supplier first" : "Add a vendor first"}
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
        <section aria-label="Purchase orders" className="flex flex-col gap-6">
          {filter === "open" ? (
            // The default view is everything still in play, in the two piles a buyer thinks in.
            <>
              <OrderSection title="On the way" orders={ordered.filter((order) => order.status !== "DRAFT")} todayKey={todayKey} zone={zone} />
              <OrderSection title="To order" orders={ordered.filter((order) => order.status === "DRAFT")} todayKey={todayKey} zone={zone} />
            </>
          ) : (
            <RecordGrid>
              {ordered.map((order) => (
                <PurchaseOrderCard key={order.id} order={order} todayKey={todayKey} zone={zone} />
              ))}
            </RecordGrid>
          )}
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
                        {formatDate(order.orderedAt ?? order.createdAt, zone)}
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

/** One pile of the default view ("On the way", "To order"), with its count; nothing at all when it is empty. */
function OrderSection({
  title,
  orders,
  todayKey,
  zone,
}: {
  title: string;
  orders: React.ComponentProps<typeof PurchaseOrderCard>["order"][];
  todayKey: string;
  zone: string;
}) {
  if (orders.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="rf-num text-muted-foreground">({orders.length})</span>
      </h2>
      <RecordGrid>
        {orders.map((order) => (
          <PurchaseOrderCard key={order.id} order={order} todayKey={todayKey} zone={zone} />
        ))}
      </RecordGrid>
    </div>
  );
}

/** An empty Easy view says what is not there, in the tab's own words. */
function emptyViewTitle(filter: PoFilter): string {
  if (filter === "DRAFT") return "Nothing waiting to be ordered";
  if (filter === "onway") return "Nothing on the way";
  if (filter === "RECEIVED") return "Nothing has arrived yet";
  if (filter === "all") return "No orders yet";
  return `No ${PO_FILTER_LABELS[filter].toLowerCase()} orders`;
}

function hrefFor(status: PoFilter, vendorId: string, query = ""): string {
  const search = new URLSearchParams();
  if (status !== "open") search.set("status", status);
  if (vendorId) search.set("vendorId", vendorId);
  if (query) search.set("q", query);
  const qs = search.toString();
  return qs ? `/inventory/purchase-orders?${qs}` : "/inventory/purchase-orders";
}

