import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

import { plural } from "@/components/customers/format";
import { RowLink } from "@/components/list/row-link";
import {
  FILTERS,
  FILTER_LABELS,
  asFilter,
  marginPct,
  stockStatus,
  type InventoryFilter,
} from "@/components/inventory/format";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { QuickAddProduct } from "@/components/inventory/quick-add-product";
import { groupDetail, stockEmptyState } from "@/components/inventory/easy-lists";
import { OrderLowButton } from "@/components/inventory/order-low-button";
import { orderMoreHref } from "@/components/inventory/restock";
import { RestockRow } from "@/components/inventory/restock-row";
import { StockBadge } from "@/components/inventory/stock-badge";
import { StockCard } from "@/components/inventory/stock-card";
import { groupTiles, StockGroupTiles } from "@/components/inventory/stock-group-tiles";
import { ProductImage } from "@/components/inventory/product-image";
import { PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { RecordGrid } from "@/components/ui/record-card";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { aiEnabled, sttEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { readUiPrefs } from "@/lib/prefs";
import { inventoryGroups } from "@/lib/inventory/groups";

export const metadata: Metadata = { title: "Stock · Repairs helper" };

const PAGE_SIZE = 24;

type SearchParams = {
  q?: string;
  filter?: string;
  category?: string;
  page?: string;
  group?: string;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shopId, role } = await requireUser();
  const [params, prefs] = await Promise.all([searchParams, readUiPrefs()]);
  const group = (params.group ?? "").trim();

  const query = (params.q ?? "").trim();
  const filter = asFilter(params.filter);
  const category = (params.category ?? "").trim();
  const showCost = role === "OWNER";
  // Gates the mic in Quick Add — voice needs a configured model. Read on the
  // server so the env check never reaches the browser bundle. Cloud voice
  // (Whisper) adds spoken Hindi/Hinglish/Punjabi and iPhone support.
  const aiOn = aiEnabled();
  const sttOn = sttEnabled();

  const overviewRows = await db.product.findMany({
    where: { ...buildWhere(shopId, query, filter, category), ...(filter === "all" ? { active: true } : {}) },
    // catalogImage lets a shelf wear a picture someone chose, without matching every product's name.
    select: { id: true, name: true, category: true, stockQty: true, catalogImage: true },
  });
  const groups = inventoryGroups(overviewRows);
  const selectedGroup = groups.find(item => item.key === group);
  const where = buildWhere(shopId, query, filter, category);
  if (group && group !== "all") where.id = { in: selectedGroup?.productIds ?? [] };
  const overview = prefs.simple && !group && !query && filter === "all" && !category && groups.length > 0;

  // Count first so an out-of-range ?page= clamps to the last real page instead
  // of rendering an "add your first product" empty state over a full list.
  // The Easy-mode overview shows only the group tiles built above — the list and
  // the category chips are hidden — so the paged count, the rows and the category
  // list are skipped rather than fetched unseen.
  const total = overview ? 0 : await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );

  const [products, categoryRows, lowStockCount] = await Promise.all([
    overview ? [] : db.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        sku: true,
        upc: true,
        category: true,
        catalogImage: true,
        priceCents: true,
        costCents: true,
        stockQty: true,
        lowStockAt: true,
        reorderQty: true,
        vendorId: true,
        active: true,
        serialized: true,
        attachments: PRODUCT_IMAGE_SELECT,
      },
    }),
    overview ? [] : db.product.findMany({
      where: { shopId, category: { not: null } },
      distinct: ["category"],
      orderBy: { category: "asc" },
      select: { category: true },
    }),
    db.product.count({ where: lowStockWhere(shopId) }),
  ]);

  const categories = categoryRows
    .map((row) => row.category)
    .filter((value): value is string => Boolean(value));

  const filtered = filter !== "all" || query !== "" || category !== "" || group !== "";
  // The shelf being looked at, for the Easy-mode "Change group" bar.
  const shelf =
    selectedGroup ??
    (group === "all"
      ? { label: "All products", quantity: overviewRows.reduce((sum, row) => sum + row.stockQty, 0), productIds: overviewRows.map((row) => row.id) }
      : null);
  const shelfLabel = shelf ? shelf.label : "All groups";
  const shelfDetail = shelf ? groupDetail(shelf.quantity, shelf.productIds.length) : null;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  // Purchasing is the owner's (the order pages show buying prices), so only the owner gets the way to it.
  const canOrder = role === "OWNER";
  const empty = stockEmptyState({ filter, query, category, group });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description="Choose a group, check quantities, or add stock."
        actions={
          <>
            {/* Purchasing lives one level in, reachable from here rather than
                from the sidebar — the rail is already thirteen items long and
                these are inventory's own sub-pages. Owner only, like the pages
                themselves. */}
            {/* Easy mode keeps ONE button up here: Suppliers and Orders sit in the
                Restock row below, Import (a rare, set-up job) at the foot of the page. */}
            {showCost && !prefs.simple ? (
              <>
                <Button variant="outline" asChild>
                  <Link href="/inventory/vendors">
                    <ICONS.vendor />
                    Vendors
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/inventory/purchase-orders">
                    <ICONS.purchaseOrder />
                    Purchase orders
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/inventory/import">
                    <ACTIONS.upload />
                    Import
                  </Link>
                </Button>
              </>
            ) : null}
            <QuickAddProduct aiEnabled={aiOn} cloudVoice={sttOn} label={prefs.simple ? "Add product" : undefined} />
          </>
        }
      />

      {/* Only worth interrupting for when nothing is filtered — inside a
          filtered view the table already answers the question. */}
      {lowStockCount > 0 && !filtered && !prefs.simple ? (
        /*
          A `tone` card, which is what this app's one card surface does with a
          state (see components/ui/card.tsx): a 3px amber stripe down the left
          edge and white everywhere else. It used to be a filled amber panel
          with its own icon tile, 20px of padding, a shadow and `rf-lift` — the
          chunky-card idiom the rest of the app left behind, sitting directly
          above a hairline table and reading as a leftover.

          It is a prompt, not a section, so it takes the same slim strip the
          unbilled-time banner does: one line at 14px, the fact in semibold and
          the advice muted beside it.
        */
        <Card tone="active" interactive>
          <Link
            href="/inventory?filter=low"
            className="flex items-center gap-2.5 rounded-lg px-4 py-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <TriangleAlert className="size-4 shrink-0 text-status-in-progress-fg" />
            <span className="min-w-0">
              <strong className="font-semibold text-foreground">
                {plural(lowStockCount, "product")} at or below{" "}
                {lowStockCount === 1 ? "its" : "their"} reorder point
              </strong>{" "}
              <span className="text-muted-foreground">
                Review what needs ordering before the bench runs dry.
              </span>
            </span>
            <ChevronRight className="ml-auto size-4 shrink-0 text-faint-foreground" />
          </Link>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Stock views"
          tabs={FILTERS.map((key) => ({
            label: FILTER_LABELS[key],
            href: hrefFor(key, category, query, group),
            active: filter === key,
            // The only count already on this page. The other three would each
            // cost a query, and a view nobody has to chase does not need one.
            count: key === "low" ? lowStockCount : undefined,
          }))}
        />

        <InventoryFilters filter={filter} query={query} category={category} group={group} easy={prefs.simple} />

        {prefs.simple && canOrder ? (
          <RestockRow
            links={[
              // While something is low, the first box says so and opens the shopping list.
              lowStockCount > 0
                ? {
                    key: "low",
                    title: "Running low",
                    detail: `${plural(lowStockCount, "item")} to order`,
                    href: hrefFor("low", "", "", ""),
                    photo: "/images/home/delivery-boxes.webp",
                    alert: true,
                    current: filter === "low",
                  }
                : {
                    key: "new",
                    title: "Order stock",
                    detail: "Buy from a supplier",
                    href: "/inventory/purchase-orders/new",
                    photo: "/images/home/delivery-boxes.webp",
                  },
              {
                key: "orders",
                title: "Orders",
                detail: "On the way and to order",
                href: "/inventory/purchase-orders",
                photo: "/images/home/invoice-pad.webp",
              },
              {
                key: "suppliers",
                title: "Suppliers",
                detail: "Who you buy from",
                href: "/inventory/vendors",
                photo: "/images/home/delivery-van.webp",
              },
            ]}
          />
        ) : null}

        {prefs.simple && canOrder && filter === "low" && lowStockCount > 0 ? (
          // The low view is a shopping list: its one big button orders the lot.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <p className="text-base">
              <span className="font-semibold">{plural(lowStockCount, "item")} running low.</span>{" "}
              <span className="text-muted-foreground">Make a draft order for each supplier, then check and place them.</span>
            </p>
            <OrderLowButton count={lowStockCount} />
          </div>
        ) : null}

        {categories.length > 0 && !prefs.simple ? (
          <FilterChips
            label="Category"
            options={[
              {
                label: "All",
                href: hrefFor(filter, "", query),
                active: category === "",
              },
              ...categories.map((name) => ({
                label: name,
                href: hrefFor(filter, name, query),
                active: category === name,
              })),
            ]}
          />
        ) : null}
      </div>

      {prefs.simple && groups.length > 0 ? (
        <details key={`${group}|${filter}|${category}|${query}|${page}`} open={overview}>
          {/*
            The key makes the panel start over (closed, or open on the overview) after every
            navigation. React only writes the `open` attribute when the prop changes, and it
            stays false while you browse shelves, so without it a panel you opened by hand
            would stay open after you picked a shelf and push the list off the screen.
            The shelves are the Home-style picture boxes. In the overview they are the
            whole screen and the summary is hidden. Anywhere else (a shelf is chosen,
            or a Low / Out / search view) they fold away behind "Change group", so the
            list under them is what you see first, and nothing is removed.
          */}
          <summary
            className={cn(
              "list-none [&::-webkit-details-marker]:hidden",
              overview ? "hidden" : "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold">{shelfLabel}</span>
              {shelfDetail ? <span className="block text-sm text-muted-foreground">{shelfDetail}</span> : null}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-base font-semibold text-muted-foreground">
              Change group
              <ChevronDown className="size-5" aria-hidden />
            </span>
          </summary>
          <div className={overview ? undefined : "pt-3"}>
            <StockGroupTiles
              current={group}
              tiles={groupTiles(
                groups,
                { quantity: overviewRows.reduce((sum, row) => sum + row.stockQty, 0), productIds: overviewRows.map((row) => row.id) },
                (key) => hrefFor(filter, category, query, key),
              )}
            />
          </div>
        </details>
      ) : null}
      {!overview ? (
        products.length === 0 ? (
          <Card>
            <CardContent className="px-0 py-0">
            {/* An empty Low or Out view is good news, said as such; only a search that finds nothing is "nothing matches". */}
            <EmptyState
              icon={ICONS.inventory}
              title={empty.title}
              hint={empty.hint}
              action={
                empty.action === "add" ? (
                  <QuickAddProduct aiEnabled={aiOn} cloudVoice={sttOn} label={prefs.simple ? "Add product" : undefined} />
                ) : (
                  <Button variant="outline" asChild className={prefs.simple ? "h-12 px-5 text-base" : undefined}>
                    <Link href={empty.action === "everyShelf" ? hrefFor(filter, "", "", "") : "/inventory"}>
                      {empty.action === "clear" ? "Clear filters" : empty.action === "everyShelf" ? "Look on every shelf" : "See all stock"}
                    </Link>
                  </Button>
                )
              }
            />
            </CardContent>
          </Card>
        ) : prefs.simple ? (
          /*
            Easy mode: the Home-style list. A card per product, the stock as the big
            number, +/- one tap away in a strip under each card. The dense table
            below is the Full-mode view of the same rows.
          */
          <section aria-label="Inventory items" className="flex flex-col gap-4">
            <RecordGrid>
              {products.map((product) => (
                <StockCard
                  key={product.id}
                  product={{
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    category: product.category,
                    priceCents: product.priceCents,
                    stockQty: product.stockQty,
                    lowStockAt: product.lowStockAt,
                    active: product.active,
                    serialized: product.serialized,
                    imageUrl: product.attachments[0] ? `/files/${product.attachments[0].id}` : null,
                    catalogImage: product.catalogImage,
                  }}
                  orderHref={
                    canOrder && product.active && ["low", "out"].includes(stockStatus(product))
                      ? orderMoreHref({ ...product, reorderQty: product.reorderQty ?? null, vendorId: product.vendorId ?? null })
                      : undefined
                  }
                />
              ))}
            </RecordGrid>

            <div className="flex flex-col items-center gap-3">
              <p className="rf-num text-sm font-medium text-muted-foreground">
                {`${firstRow}–${lastRow} of ${plural(total, "product")}`}
              </p>
              {pageCount > 1 ? (
                <div className="grid w-full max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <PageLink href={pageHref(params, page - 1)} disabled={page <= 1} label="Previous" big>
                    <ACTIONS.back />
                    Previous
                  </PageLink>
                  <span className="rf-num text-center text-base font-semibold">
                    Page {page} of {pageCount}
                  </span>
                  <PageLink href={pageHref(params, page + 1)} disabled={page >= pageCount} label="Next" big>
                    Next
                    <ACTIONS.next />
                  </PageLink>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <Card>
            <CardContent className="px-0 py-0">
              <Table>
                <THead>
                  <Tr>
                    <Th>Product</Th>
                    <Th>SKU · UPC</Th>
                    <Th>Category</Th>
                    <Th>Stock</Th>
                    <Th className="text-right">Price</Th>
                    {showCost ? <Th className="text-right">Cost</Th> : null}
                    {showCost ? <Th className="text-right">Margin</Th> : null}
                  </Tr>
                </THead>
                <TBody>
                  {products.map((product) => {
                    const margin = marginPct(product.priceCents, product.costCents);
                    const identifiers = `${product.sku ?? "No SKU"}${
                      product.upc ? ` · ${product.upc}` : ""
                    }`;

                    return (
                      <RowLink key={product.id} href={`/inventory/${product.id}`}>
                        <Td>
                          <span className="flex items-center gap-3">
                            <ProductImage productId={product.id} name={product.name} category={product.category} catalogImage={product.catalogImage} imageUrl={product.attachments[0] ? `/files/${product.attachments[0].id}` : null} className="size-14 shrink-0 border" sizes="56px" />
                            <Link
                              href={`/inventory/${product.id}`}
                              title={product.name}
                              className={cn(
                                "block max-w-[320px] truncate font-semibold hover:underline",
                                product.active
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {product.name}
                            </Link>
                            {!product.active ? (
                              <StatusPill tone="neutral" label="Inactive" size="sm" />
                            ) : null}
                          </span>
                        </Td>
                        <Td>
                          <span
                            title={identifiers}
                            className="rf-id block max-w-[190px] truncate text-[12.5px] text-faint-foreground"
                          >
                            {identifiers}
                          </span>
                        </Td>
                        <Td className="text-muted-foreground">
                          {product.category ?? "—"}
                        </Td>
                        <Td>
                          <StockBadge product={product} />
                        </Td>
                        <Td className="text-right font-semibold text-foreground">
                          {formatCents(product.priceCents)}
                        </Td>
                        {showCost ? (
                          <Td className="text-right text-muted-foreground">
                            {product.costCents == null
                              ? "—"
                              : formatCents(product.costCents)}
                          </Td>
                        ) : null}
                        {showCost ? (
                          <Td className="text-right text-muted-foreground">
                            {margin == null ? "—" : `${margin}%`}
                          </Td>
                        ) : null}
                      </RowLink>
                    );
                  })}
                </TBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                <p className="rf-num text-[12.5px] font-medium text-muted-foreground">
                  {`${firstRow}–${lastRow} of ${plural(total, "product")}`}
                </p>
                {pageCount > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <PageLink
                      href={pageHref(params, page - 1)}
                      disabled={page <= 1}
                      label="Previous"
                    >
                      <ACTIONS.back />
                      Previous
                    </PageLink>
                    <span className="rf-num px-1 text-[12.5px] font-medium text-muted-foreground">
                      {page} / {pageCount}
                    </span>
                    <PageLink
                      href={pageHref(params, page + 1)}
                      disabled={page >= pageCount}
                      label="Next"
                    >
                      Next
                      <ACTIONS.next />
                    </PageLink>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      {prefs.simple && showCost ? (
        <p className="text-center text-base text-muted-foreground">
          Have a product list in a spreadsheet?{" "}
          <Link href="/inventory/import" data-touch-control className="inline-flex min-h-12 items-center gap-1.5 font-semibold text-foreground underline underline-offset-4">
            <ACTIONS.upload className="size-4" aria-hidden />
            Import it
          </Link>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "At or below the reorder point", expressed once.
 *
 * `lowStockAt >= stockQty` is a same-row column comparison (a Prisma field
 * reference). Writing it on the NULLABLE side is deliberate: a product with no
 * reorder point yields NULL, which SQL drops from the result — exactly the
 * "not stock-tracked" behaviour the badge shows, with no extra clause.
 */
function lowStockWhere(shopId: string): Prisma.ProductWhereInput {
  return {
    shopId,
    active: true,
    lowStockAt: { gte: db.product.fields.stockQty },
  };
}

function buildWhere(
  shopId: string,
  query: string,
  filter: InventoryFilter,
  category: string,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { shopId };

  // The views mirror the badge rules exactly, so a row can never show green
  // inside the "Low stock" view.
  if (filter === "low") {
    where.active = true;
    where.lowStockAt = { gte: db.product.fields.stockQty };
  } else if (filter === "out") {
    where.active = true;
    where.stockQty = { lte: 0 };
    // Tracked items only: labour and services sit at 0 forever by design.
    where.lowStockAt = { not: null };
  } else if (filter === "inactive") {
    where.active = false;
  }

  if (category) where.category = category;

  // Every whitespace-separated token must match at least one field, so
  // "iphone screen" finds the screen assembly and "iphone keyboard" finds
  // nothing.
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
    where.AND = tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { sku: { contains: token, mode: "insensitive" as const } },
        { upc: { contains: token, mode: "insensitive" as const } },
      ],
    }));
  }

  return where;
}

/** A view is a URL: shareable, bookmarkable, and back-button correct. */
function hrefFor(
  filter: InventoryFilter,
  category: string,
  query: string,
  group = "",
): string {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (query) search.set("q", query);
  if (category) search.set("category", category);
  if (group) search.set("group", group);
  const qs = search.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function pageHref(params: SearchParams, page: number): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.category?.trim()) search.set("category", params.category.trim());
  if (params.group?.trim()) search.set("group", params.group.trim());
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function PageLink({
  href,
  disabled,
  label,
  children,
  big = false,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
  /** Easy mode: a 48px button instead of the small one. */
  big?: boolean;
}) {
  const bigClass = big ? "h-12 px-5 text-base [&_svg]:size-5" : undefined;
  if (disabled) {
    return (
      <Button size="sm" variant="outline" disabled aria-label={label} className={bigClass}>
        {children}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" asChild className={bigClass}>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
