import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronRight, TriangleAlert } from "lucide-react";

import { plural } from "@/components/customers/format";
import { RowLink } from "@/components/list/row-link";
import {
  FILTERS,
  FILTER_LABELS,
  asFilter,
  marginPct,
  type InventoryFilter,
} from "@/components/inventory/format";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { StockBadge } from "@/components/inventory/stock-badge";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Inventory · RepairFlow" };

const PAGE_SIZE = 24;

type SearchParams = {
  q?: string;
  filter?: string;
  category?: string;
  page?: string;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shopId, role } = await requireUser();
  const params = await searchParams;

  const query = (params.q ?? "").trim();
  const filter = asFilter(params.filter);
  const category = (params.category ?? "").trim();
  const showCost = role === "OWNER";

  const where = buildWhere(shopId, query, filter, category);

  // Count first so an out-of-range ?page= clamps to the last real page instead
  // of rendering an "add your first product" empty state over a full list.
  const total = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );

  const [products, categoryRows, lowStockCount] = await Promise.all([
    db.product.findMany({
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
        priceCents: true,
        costCents: true,
        stockQty: true,
        lowStockAt: true,
        active: true,
      },
    }),
    db.product.findMany({
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

  const filtered = filter !== "all" || query !== "" || category !== "";
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="Every part, accessory and service the shop sells, with what's on the shelf."
        actions={
          <>
            {/* Purchasing lives one level in, reachable from here rather than
                from the sidebar — the rail is already thirteen items long and
                these are inventory's own sub-pages. Owner only, like the pages
                themselves. */}
            {showCost ? (
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
            <Button asChild>
              <Link href="/inventory/new">
                <ACTIONS.add />
                New Product
              </Link>
            </Button>
          </>
        }
      />

      {/* Only worth interrupting for when nothing is filtered — inside a
          filtered view the table already answers the question. */}
      {lowStockCount > 0 && !filtered ? (
        <Link
          href="/inventory?filter=low"
          className="rf-lift flex items-center gap-4 rounded-lg border border-status-in-progress/25 bg-status-in-progress-bg p-5 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-status-in-progress/15 text-status-in-progress-fg">
            <TriangleAlert className="size-5" strokeWidth={2.25} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-bold text-status-in-progress-fg">
              {plural(lowStockCount, "product")} at or below{" "}
              {lowStockCount === 1 ? "its" : "their"} reorder point
            </span>
            <span className="text-[13.5px] text-status-in-progress-fg/80">
              Review what needs ordering before the bench runs dry.
            </span>
          </span>
          <ChevronRight className="ml-auto size-5 shrink-0 text-status-in-progress-fg" />
        </Link>
      ) : null}

      <div className="flex flex-col gap-3">
        <FilterTabs
          aria-label="Stock views"
          tabs={FILTERS.map((key) => ({
            label: FILTER_LABELS[key],
            href: hrefFor(key, category, query),
            active: filter === key,
            // The only count already on this page. The other three would each
            // cost a query, and a view nobody has to chase does not need one.
            count: key === "low" ? lowStockCount : undefined,
          }))}
        />

        <InventoryFilters filter={filter} query={query} category={category} />

        {categories.length > 0 ? (
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

      <Card>
        <CardContent className="px-0 py-0">
          {products.length === 0 ? (
            <EmptyState
              icon={ICONS.inventory}
              title={filtered ? "Nothing matches those filters" : "No products yet"}
              hint={
                filtered
                  ? "Try a shorter search, or clear the filters to see the whole catalogue."
                  : "Add the parts and services you sell so they're one click away on tickets and invoices."
              }
              action={
                filtered ? (
                  <Button variant="outline" asChild>
                    <Link href="/inventory">Clear filters</Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/inventory/new">
                      <ACTIONS.add />
                      New Product
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
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
                          <span className="flex items-center gap-2">
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
            </>
          )}
        </CardContent>
      </Card>
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
): string {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (query) search.set("q", query);
  if (category) search.set("category", category);
  const qs = search.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function pageHref(params: SearchParams, page: number): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.category?.trim()) search.set("category", params.category.trim());
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button size="sm" variant="outline" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" asChild>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
